import axios, { Axios, AxiosHeaders, AxiosProxyConfig, AxiosResponseHeaders, RawAxiosResponseHeaders } from "axios";
import { exec } from "child_process";
import { appendFile } from "fs";
import { open, readdir, writeFile } from "fs/promises";

module log {
  const log_name: string = "updater.log"
  export function Info(s: string) {
    const now = new Date();
    s = '[' + now.toISOString() + '] ' + "[INFO] " + s + "\n"
    console.log(s)
    appendFile(log_name, s, () => { })
  }

  export function Error(s: string) {
    const now = new Date();
    s = '[' + now.toISOString() + '] ' + "[ERROR] " + s + "\n"
    console.error(s)
    appendFile(log_name, s, () => { })
  }
}

module proxy {
  let proxy_setting: AxiosProxyConfig | false = false
  export function GetProxySetting(): AxiosProxyConfig | false {
    return proxy_setting
  }

  export function SetProxySetting(host: string = "", port: number = 0) {
    if (host == "" && port != 0) {
      proxy_setting == false
    } else {
      proxy_setting = {
        host: host,
        port: port,
        protocol: "http"
      }
    }
  }
}

async function CreateEmptyFile(file_name: string, file_size: number, buffer_size: number = 1024 * 1024) {
  let empty_buffer = Buffer.alloc(buffer_size)
  let fd = await open(file_name, 'w')
  for (; ;) {
    if (file_size > buffer_size) {
      file_size -= buffer_size
      await fd.write(empty_buffer)
      continue
    }
    fd.write(empty_buffer, 0, file_size)
    break
  }
}

async function Head(url: string) {
  return (await axios.head(url, { proxy: proxy.GetProxySetting() })).headers
}

async function Download(url: string) {
  let data = (await axios.get(url, { proxy: proxy.GetProxySetting(), responseType: "arraybuffer" })).data
  await writeFile("target.zip", data, 'binary')
}

function GetFileNameFromHeader(headers: RawAxiosResponseHeaders | AxiosResponseHeaders): string | undefined {
  let content_disposition = headers['content-disposition']
  const search_string: string = "filename="
  let num = content_disposition?.search(search_string)
  if (num === undefined || num === -1) return
  return content_disposition?.substring(num + search_string.length)
}

let download_id: number = 0
function GetDownloadId() {
  return ++download_id
}

async function DownloadInRange(url: string, range: [number, number]) {
  let id = GetDownloadId()
  console.log("download start id:" + id + " range:" + range[0] + "-" + range[1])
  let res = await axios.get(url,
    {
      proxy: proxy.GetProxySetting(),
      responseType: "arraybuffer",
      headers: {
        Range: "bytes=" + range[0] + "-" + range[1]
      },
      onDownloadProgress(progressEvent) {
        console.log("id:" + id + " ", progressEvent)
      },

    })
  return res.data
}

async function ParallelDownload(url: string) {
  let headers = await Head(url)
  let file_size = headers["content-length"]
  if (!file_size) return
  let file_length = parseInt(file_size)
  let file_half_size = Math.round(file_length / 2)
  let promise_list = new Array<Promise<void>>()
  let data_list = new Array(2)
  promise_list.push(
    (async () => {
      let block: [number, number] = [0, file_half_size]
      data_list[0] = await DownloadInRange(url, block)
    })(),
  )
  promise_list.push(
    (async () => {
      let block: [number, number] = [file_half_size + 1, file_length]
      data_list[1] = await DownloadInRange(url, block)
    })(),
  )
  for (let p of promise_list)
    await p
  let file_name = GetFileNameFromHeader(headers)
  if (!file_name) file_name = "file"
  let fd = await open(file_name, "w")
  fd.write(data_list[0], null, "binary")
  fd.write(data_list[1], null, "binary")
}


(async () => {
  exec("7z x ryujinx-1.1.394-win_x64.zip -y -oE:\\Games\\Ryujinx", (...args) => {
    console.log(args)
  })
})()
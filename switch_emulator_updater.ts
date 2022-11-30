import axios from "axios"
import { exec, ExecException } from "child_process";
import find from "find-process";
import { appendFile } from "fs";
import { readdir, readFile, unlink, writeFile } from "fs/promises";
import { DownloadTask } from "./download";

module log {
  const log_name: string = "updater.log"
  export function Info(s: string) {
    let tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    let localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
    s = '[' + localISOTime + '] ' + "[INFO] " + s
    console.log(s)
    appendFile(log_name, s + "\n", () => { })
  }

  export function Error(s: string) {
    let tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    let localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
    s = '[' + localISOTime + '] ' + "[ERROR] " + s
    console.error(s)
    appendFile(log_name, s + "\n", () => { })
  }
}


module history {
  const file_path = "history.json"

  interface Struct {
    version: string
  }

  export async function Get(): Promise<Struct> {
    try {
      let content = await readFile(file_path)
      let history = JSON.parse(content.toString())
      if (!history.version) history.version = ""
      return history
    } catch (e) {
      log.Error(e + '')
      return { version: "" }
    }
  }

  export async function Set(data: Struct) {
    return writeFile(file_path, JSON.stringify(data))
  }
}

function DecompressFile(src_file: string, dst_directory: string) {
  return new Promise<string>(
    (resolve, reject) => {
      exec("7z x " + src_file + " -o" + dst_directory + " -y", (err: ExecException | null, stdout: string, stderr: string) => {
        if (err) {
          reject([err, stdout, stderr])
          return
        }
        resolve(stdout)
      })
    }
  )
}

module proxy {
  let proxy: { host: string, port: number } | false = false

  export function SetProxy(val: false): void;
  export function SetProxy(host: string, port: number): void;
  export function SetProxy(val: any, port?: number): void {
    if (typeof val == "boolean" && val == false) {
      proxy = false
      return
    }
    if (typeof val == "string" && typeof port == "number") {
      proxy = {
        host: val,
        port: port
      }
    }
  }

  export function GetProxy() {
    return proxy
  }

  export function GetAxiosProxy() {
    if (proxy == false) return false
    return {
      host: proxy.host,
      port: proxy.port,
      protocol: 'http'
    }
  }
}

const dst_path = "E:\\Games\\ryujinx";
// const dst_path = "./";

if (false) {
  (async () => {
    let response = await DecompressFile("ryujinx-1.1.394-win_x64.zip", "E:\\Games\\ryujinx")
    console.log(response)
  })()
} else {
  (async () => {
    let find_process_res = await find('name', "Ryujinx")
    if (find_process_res.length > 0) {
      log.Info("Ryujinx is running,exit")
      return
    }
    proxy.SetProxy("127.0.0.1", 7890)
    let res = await axios.get('https://api.github.com/repos/Ryujinx/release-channel-master/releases/latest',
      { proxy: proxy.GetAxiosProxy() }
    )
    let version = res.data.tag_name
    let history_data = await history.Get()
    if (history_data.version === version) {
      log.Info("current version " + version + " is the latest,exit")
      return
    }
    const target_package_name: string = "ryujinx-" + version + "-win_x64.zip"
    for (let asset of res.data.assets) {
      if (asset.name == target_package_name) {
        let download_url = asset.browser_download_url
        log.Info("downloading " + target_package_name)
        let task = new DownloadTask()
        task.SetProxy(proxy.GetProxy())
        await task.Start(download_url)
        let file_name = task.GetFileName()
        log.Info("extracting " + file_name)
        await DecompressFile(file_name, dst_path)
        history_data.version = version
        await history.Set(history_data)
        let dir_list = await readdir("./")
        log.Info("cleaning...")
        for (let file_name of dir_list) {
          let file_ext = file_name.split('.').pop();
          if (file_ext == "zip") {
            log.Info("delete " + file_name)
            await unlink(file_name)
          }
        }
        log.Info("all done,exit")
        return
      }
    }
  })()
}
import axios from "axios"
import find from "find-process";
import { appendFile } from "fs";
import { readFile, writeFile } from "fs/promises";
import { extractFull } from "node-7z";
import { DownloadTask } from "./download";

module log {
  const log_name: string = "updater.log"
  export function Info(s: string) {
    const now = new Date();
    s = '[' + now.toISOString() + '] ' + "[INFO] " + s
    console.log(s)
    appendFile(log_name, s + "\n", () => { })
  }

  export function Error(s: string) {
    const now = new Date();
    s = '[' + now.toISOString() + '] ' + "[ERROR] " + s
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
    let res = await find("name", "Ryujinx")
    for (let o of res) {
      console.log(o)
    }
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
        extractFull(file_name, dst_path, { yes: true })
        history_data.version = version
        await history.Set(history_data)
        log.Info("all done,exit")
        return
      }
    }
  })()
}
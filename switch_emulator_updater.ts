import axios from "axios"
import { appendFile } from "fs";
import { extractFull } from "node-7z";
import { DownloadTask } from "./download";

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

(async () => {
  proxy.SetProxy("127.0.0.1", 7890)
  let res = await axios.get('https://api.github.com/repos/Ryujinx/release-channel-master/releases/latest',
    { proxy: proxy.GetAxiosProxy() }
  )
  let version = res.data.tag_name
  const target_package_name: string = "ryujinx-" + version + "-win_x64.zip"
  for (let asset of res.data.assets) {
    if (asset.name == target_package_name) {
      let download_url = asset.browser_download_url
      let task = new DownloadTask()
      task.SetProxy(proxy.GetProxy())
      await task.Start(download_url)
      let file_name = task.GetFileName()
      extractFull(file_name, "E:\\Games\\ryujinx", { yes: true })
      return
    }
  }
})()
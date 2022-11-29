import axios, { AxiosProxyConfig } from "axios";
import { FileHandle, open } from "fs/promises";

function Sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type Config = {
  connection_number: number
  buffer_per_connection: number
}

export const default_config: Config = {
  connection_number: 2,
  buffer_per_connection: 1024 * 1024 * 20
}

export class DownloadTask {
  protected file_total_size_: number = 0
  protected file_name_: string = ""
  protected proxy_: AxiosProxyConfig | false = false
  protected create_file_handle_: Promise<void> | undefined
  protected config_: Config | false = false

  async Start(url: string) {
    await this.ParseFile(url)
    console.log({ "file_name": this.file_name_, "file_size": this.file_total_size_ })
    if (this.file_name_ === '') this.file_name_ = "file" + new Date().getTime()
    if (this.file_total_size_ === 0) throw "unknown file size"
    let config = this.GetConfig()
    let fd = await open(this.file_name_, 'w')
    this.create_file_handle_ = (async () => {
      await DownloadTask.WriteEmptyFile(fd, this.file_total_size_)
    })()
    let async_task_list = new Array<Promise<void>>()
    const end = this.file_total_size_ - 1
    let cursor = 0
    let is_file_writing = false
    for (let i = 0; i < config.connection_number; i++) {
      async_task_list.push(
        (async () => {
          let id = i + 1
          for (; ;) {
            let index = cursor++
            let range_begin = index * config.buffer_per_connection
            if (range_begin > end) return
            let range_end = (index + 1) * config.buffer_per_connection - 1
            if (range_end > end) range_end = end
            console.log({ "id": id, range_begin: range_begin, range_end: range_end })
            for (; ;) {
              try {
                let response = await axios.get(url,
                  {
                    responseType: "arraybuffer",
                    headers: {
                      Range: "bytes=" + range_begin + "-" + range_end
                    },
                    proxy: this.proxy_,
                    onDownloadProgress(progressEvent) {
                      console.log("id:" + id + " ", progressEvent)
                    }
                  }
                )
                await this.create_file_handle_
                for (; ;) {
                  if (is_file_writing) {
                    await Sleep(100)
                    continue
                  }
                  is_file_writing = true
                  await fd.write(response.data, 0, range_end - range_begin + 1, range_begin)
                  is_file_writing = false
                  break
                }
                break
              } catch (e) {
                console.log(e)
                continue
              }
            }
          }
        })()
      )
    }
    for (let o of async_task_list) await o
    await fd.close()
  }

  SetProxy(setting: { host: string, port: number } | false) {
    if (typeof setting == "boolean")
      this.proxy_ = false
    else
      this.proxy_ = { host: setting.host, port: setting.port, protocol: "http" }
  }

  GetFileName() {
    return this.file_name_
  }

  GetConfig(): Config {
    if (this.config_) return this.config_
    const default_connection_number = 4
    const max_buffer = 1024 * 1024 * 128
    let buffer_per_connection = this.file_total_size_ / 4
    let max_buffer_per_connection = max_buffer / 4
    return {
      connection_number: default_connection_number,
      buffer_per_connection: buffer_per_connection > max_buffer_per_connection ? max_buffer_per_connection : buffer_per_connection
    }
  }

  SetConfig(config: Config | false): void {
    this.config_ = config
  }

  protected async ParseFile(url: string) {
    let headers = (await axios.head(url, { proxy: this.proxy_ })).headers
    let content_length = headers['content-length']
    if (content_length)
      this.file_total_size_ = parseInt(content_length)
    if (this.file_name_) return
    let content_disposition = headers['content-disposition']
    if (!content_disposition) return
    const search_string: string = "filename="
    let num = content_disposition.search(search_string)
    if (num === -1) return
    this.file_name_ = content_disposition.substring(num + search_string.length)
  }

  static async WriteEmptyFile(fd: FileHandle, file_size: number, buffer_size: number = 1024 * 1024) {
    let empty_buffer = Buffer.alloc(buffer_size)
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
}
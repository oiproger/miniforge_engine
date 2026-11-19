declare module 'assimpjs' {
  export interface AssimpResultFile {
    GetPath(): string
    GetContent(): Uint8Array
  }
  export interface AssimpResult {
    IsSuccess(): boolean
    GetErrorCode(): string
    FileCount(): number
    GetFile(index: number): AssimpResultFile
  }
  export interface AssimpFileList {
    AddFile(path: string, content: Uint8Array): void
  }
  export interface AssimpInstance {
    FileList: new () => AssimpFileList
    ConvertFileList(fileList: AssimpFileList, format: string): AssimpResult
  }
  export default function assimpjs(options?: {
    locateFile?: (path: string, prefix: string) => string
  }): Promise<AssimpInstance>
}

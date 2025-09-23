declare module 'spark-md5' {
  class SparkMD5 {
    constructor(input?: string);
    append(str: string): SparkMD5;
    end(raw?: boolean): string;
    static hash(str: string, raw?: boolean): string;
  }

  namespace SparkMD5 {
    // Minimal API used in the app for hashing ArrayBuffers
    const ArrayBuffer: {
      hash(data: ArrayBuffer | Uint8Array, raw?: boolean): string;
    };
  }

  export default SparkMD5;
}



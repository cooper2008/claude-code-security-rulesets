/**
 * Efficient serialization and compression for cache storage
 * Optimized for validation results and configuration objects
 */

import { promisify } from 'util';
import * as zlib from 'zlib';
import { CacheSerializer } from './types';

// Promisified compression functions
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

/**
 * JSON serializer with optional compression
 */
export class JsonSerializer implements CacheSerializer {
  private readonly compress: boolean;
  private readonly compressionThreshold: number;
  private readonly compressionType: 'gzip' | 'brotli';
  private readonly compressionLevel: number;

  constructor(options: {
    compress?: boolean;
    compressionThreshold?: number;
    compressionType?: 'gzip' | 'brotli';
    compressionLevel?: number;
  } = {}) {
    this.compress = options.compress !== false;
    this.compressionThreshold = options.compressionThreshold || 1024; // 1KB default
    this.compressionType = options.compressionType || 'gzip';
    this.compressionLevel = options.compressionLevel || 6; // Default compression level
  }

  /**
   * Serialize a value to string or buffer
   */
  serialize(value: any): string | Buffer {
    try {
      const json = JSON.stringify(value, this.replacer);
      
      // Don't compress small values
      if (!this.compress || json.length < this.compressionThreshold) {
        return json;
      }

      // Synchronous compression for small values
      if (json.length < 10240) { // 10KB
        return this.compressSync(json);
      }

      // Return uncompressed for large values (async compression handled separately)
      return json;
    } catch (error) {
      throw new Error(`Serialization failed: ${error}`);
    }
  }

  /**
   * Deserialize a value from string or buffer
   */
  deserialize<T = any>(data: string | Buffer): T {
    try {
      // Check if data is compressed
      if (Buffer.isBuffer(data)) {
        const decompressed = this.decompressSync(data);
        return JSON.parse(decompressed, this.reviver);
      }

      // Check for compression markers in string
      if (typeof data === 'string') {
        if (data.startsWith('gzip:') || data.startsWith('brotli:')) {
          const [type, base64] = data.split(':', 2);
          const buffer = Buffer.from(base64, 'base64');
          const decompressed = this.decompressSync(buffer);
          return JSON.parse(decompressed, this.reviver);
        }
      }

      return JSON.parse(data as string, this.reviver);
    } catch (error) {
      throw new Error(`Deserialization failed: ${error}`);
    }
  }

  /**
   * Async compression for large values
   */
  async compressAsync(data: string | Buffer): Promise<Buffer> {
    const input = typeof data === 'string' ? Buffer.from(data) : data;

    if (this.compressionType === 'brotli') {
      return brotliCompressAsync(input, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: this.compressionLevel
        }
      });
    }

    return gzipAsync(input, { level: this.compressionLevel });
  }

  /**
   * Async decompression for large values
   */
  async decompressAsync(data: Buffer): Promise<string> {
    // Detect compression type by magic bytes
    if (this.isBrotli(data)) {
      const decompressed = await brotliDecompressAsync(data);
      return decompressed.toString('utf8');
    }

    if (this.isGzip(data)) {
      const decompressed = await gunzipAsync(data);
      return decompressed.toString('utf8');
    }

    return data.toString('utf8');
  }

  /**
   * Synchronous compression for small values
   */
  private compressSync(data: string): Buffer {
    const input = Buffer.from(data);

    if (this.compressionType === 'brotli') {
      return zlib.brotliCompressSync(input, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: this.compressionLevel
        }
      });
    }

    return zlib.gzipSync(input, { level: this.compressionLevel });
  }

  /**
   * Synchronous decompression
   */
  private decompressSync(data: Buffer): string {
    if (this.isBrotli(data)) {
      return zlib.brotliDecompressSync(data).toString('utf8');
    }

    if (this.isGzip(data)) {
      return zlib.gunzipSync(data).toString('utf8');
    }

    return data.toString('utf8');
  }

  /**
   * Check if buffer is gzip compressed
   */
  private isGzip(data: Buffer): boolean {
    return data.length > 2 && data[0] === 0x1f && data[1] === 0x8b;
  }

  /**
   * Check if buffer is brotli compressed
   */
  private isBrotli(data: Buffer): boolean {
    // Brotli doesn't have standard magic bytes, but we can check for valid brotli stream
    try {
      zlib.brotliDecompressSync(data.slice(0, Math.min(100, data.length)));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * JSON replacer for special types
   */
  private replacer(key: string, value: any): any {
    // Handle Date objects
    if (value instanceof Date) {
      return {
        __type: 'Date',
        value: value.toISOString()
      };
    }

    // Handle RegExp objects
    if (value instanceof RegExp) {
      return {
        __type: 'RegExp',
        source: value.source,
        flags: value.flags
      };
    }

    // Handle Set objects
    if (value instanceof Set) {
      return {
        __type: 'Set',
        values: Array.from(value)
      };
    }

    // Handle Map objects
    if (value instanceof Map) {
      return {
        __type: 'Map',
        entries: Array.from(value.entries())
      };
    }

    // Handle Buffer objects
    if (Buffer.isBuffer(value)) {
      return {
        __type: 'Buffer',
        data: value.toString('base64')
      };
    }

    return value;
  }

  /**
   * JSON reviver for special types
   */
  private reviver(key: string, value: any): any {
    if (value && typeof value === 'object' && value.__type) {
      switch (value.__type) {
        case 'Date':
          return new Date(value.value);
        
        case 'RegExp':
          return new RegExp(value.source, value.flags);
        
        case 'Set':
          return new Set(value.values);
        
        case 'Map':
          return new Map(value.entries);
        
        case 'Buffer':
          return Buffer.from(value.data, 'base64');
      }
    }

    return value;
  }
}

/**
 * MessagePack serializer for more efficient binary serialization
 * Requires @msgpack/msgpack package
 */
export class MessagePackSerializer implements CacheSerializer {
  private msgpack: any;
  private readonly compress: boolean;

  constructor(options: { compress?: boolean } = {}) {
    this.compress = options.compress !== false;
    
    // Lazy load msgpack if available
    try {
      this.msgpack = require('@msgpack/msgpack');
    } catch {
      // Fall back to JSON if msgpack not available
      this.msgpack = null;
    }
  }

  serialize(value: any): Buffer {
    if (!this.msgpack) {
      // Fall back to JSON
      return Buffer.from(JSON.stringify(value));
    }

    try {
      const packed = this.msgpack.encode(value);
      
      if (this.compress && packed.length > 1024) {
        return zlib.gzipSync(packed);
      }

      return packed;
    } catch (error) {
      throw new Error(`MessagePack serialization failed: ${error}`);
    }
  }

  deserialize<T = any>(data: Buffer): T {
    if (!this.msgpack) {
      // Fall back to JSON
      return JSON.parse(data.toString('utf8'));
    }

    try {
      let buffer = data;

      // Check if compressed
      if (data[0] === 0x1f && data[1] === 0x8b) {
        buffer = zlib.gunzipSync(data);
      }

      return this.msgpack.decode(buffer);
    } catch (error) {
      throw new Error(`MessagePack deserialization failed: ${error}`);
    }
  }

  async compressAsync(data: Buffer): Promise<Buffer> {
    return gzipAsync(data);
  }

  async decompressAsync(data: Buffer): Promise<Buffer> {
    return gunzipAsync(data);
  }
}

/**
 * Factory for creating serializers
 */
export class SerializerFactory {
  private static jsonSerializer: JsonSerializer;
  private static msgpackSerializer: MessagePackSerializer;

  /**
   * Get JSON serializer (singleton)
   */
  static getJsonSerializer(options?: {
    compress?: boolean;
    compressionThreshold?: number;
    compressionType?: 'gzip' | 'brotli';
  }): JsonSerializer {
    if (!this.jsonSerializer) {
      this.jsonSerializer = new JsonSerializer(options);
    }
    return this.jsonSerializer;
  }

  /**
   * Get MessagePack serializer (singleton)
   */
  static getMessagePackSerializer(options?: { compress?: boolean }): MessagePackSerializer {
    if (!this.msgpackSerializer) {
      this.msgpackSerializer = new MessagePackSerializer(options);
    }
    return this.msgpackSerializer;
  }

  /**
   * Create a new serializer instance
   */
  static create(
    type: 'json' | 'msgpack' = 'json',
    options?: any
  ): CacheSerializer {
    switch (type) {
      case 'msgpack':
        return new MessagePackSerializer(options);
      case 'json':
      default:
        return new JsonSerializer(options);
    }
  }
}

// Export default serializer
export const defaultSerializer = SerializerFactory.getJsonSerializer();
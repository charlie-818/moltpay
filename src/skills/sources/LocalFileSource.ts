import * as fs from 'fs';
import * as path from 'path';
import { SkillLoader, LoadOptions, LoadResult } from '../SkillLoader';
import { InstalledSkill } from '../types';

export interface LocalFileSourceConfig {
  directories: string[];
  watchForChanges?: boolean;
}

export class LocalFileSource {
  private loader: SkillLoader;
  private config: LocalFileSourceConfig;
  private watchers: Map<string, () => void> = new Map();

  constructor(config: LocalFileSourceConfig) {
    this.config = config;
    this.loader = new SkillLoader();
  }

  /**
   * Scan all configured directories for skills
   */
  async scanAll(options: LoadOptions = {}): Promise<LoadResult[]> {
    const results: LoadResult[] = [];

    for (const dir of this.config.directories) {
      try {
        const dirResults = await this.loader.loadFromDirectory(dir, {
          ...options,
          trustLevel: 'untrusted', // Local files are untrusted by default
        });
        results.push(...dirResults);
      } catch (error) {
        console.warn(`Failed to scan directory ${dir}:`, error);
      }
    }

    return results;
  }

  /**
   * Load a single skill file
   */
  async loadFile(filePath: string, options: LoadOptions = {}): Promise<LoadResult> {
    return this.loader.loadFromFile(filePath, {
      ...options,
      trustLevel: options.trustLevel || 'untrusted',
    });
  }

  /**
   * Add a directory to scan
   */
  addDirectory(dirPath: string): void {
    if (!this.config.directories.includes(dirPath)) {
      this.config.directories.push(dirPath);
    }
  }

  /**
   * Remove a directory from scanning
   */
  removeDirectory(dirPath: string): void {
    const index = this.config.directories.indexOf(dirPath);
    if (index !== -1) {
      this.config.directories.splice(index, 1);
      this.stopWatching(dirPath);
    }
  }

  /**
   * Start watching a directory for changes
   */
  startWatching(
    dirPath: string,
    callbacks: {
      onAdd?: (result: LoadResult) => void;
      onRemove?: (filePath: string) => void;
      onChange?: (result: LoadResult) => void;
    }
  ): void {
    if (this.watchers.has(dirPath)) {
      return;
    }

    const stop = this.loader.watchDirectory(dirPath, callbacks);
    this.watchers.set(dirPath, stop);
  }

  /**
   * Stop watching a directory
   */
  stopWatching(dirPath: string): void {
    const stop = this.watchers.get(dirPath);
    if (stop) {
      stop();
      this.watchers.delete(dirPath);
    }
  }

  /**
   * Stop watching all directories
   */
  stopAllWatching(): void {
    for (const stop of this.watchers.values()) {
      stop();
    }
    this.watchers.clear();
  }

  /**
   * Get configured directories
   */
  getDirectories(): string[] {
    return [...this.config.directories];
  }

  /**
   * Check if a path is within any configured directory
   */
  isInScope(filePath: string): boolean {
    const absolute = path.resolve(filePath);
    return this.config.directories.some(dir => {
      const absDir = path.resolve(dir);
      return absolute.startsWith(absDir);
    });
  }
}

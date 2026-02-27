/**
 * Configuration Manager for AI Docs Interpreter
 * Handles VS Code settings and provides typed configuration access
 */

import * as vscode from 'vscode';
import { ExtensionConfig } from '../types/interfaces';

export class ConfigurationManager {
  private static readonly CONFIGURATION_SECTION = 'aiDocsInterpreter';

  /**
   * Get the complete extension configuration
   */
  static getConfiguration(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);

    return {
      indexing: {
        includePaths: config.get<string[]>('indexing.includePaths', ['README.md', 'docs/**/*.md']),
        excludePaths: config.get<string[]>('indexing.excludePaths', ['node_modules/**', '.git/**', 'dist/**', 'build/**']),
        maxFileSize: config.get<number>('indexing.maxFileSize', 1048576), // 1MB
        autoReindex: config.get<boolean>('indexing.autoReindex', false)
      },
      retrieval: {
        topK: config.get<number>('retrieval.topK', 5),
        similarityThreshold: config.get<number>('retrieval.similarityThreshold', 0.3),
        maxContextLength: config.get<number>('retrieval.maxContextLength', 2000)
      },
      ui: {
        hoverEnabled: config.get<boolean>('ui.hoverEnabled', true),
        sidePanelEnabled: config.get<boolean>('ui.sidePanelEnabled', true),
        maxHoverLines: config.get<number>('ui.maxHoverLines', 3)
      }
    };
  }

  /**
   * Get indexing configuration
   */
  static getIndexingConfig() {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    
    return {
      includePaths: config.get<string[]>('indexing.includePaths', ['README.md', 'docs/**/*.md']),
      excludePaths: config.get<string[]>('indexing.excludePaths', ['node_modules/**', '.git/**', 'dist/**', 'build/**']),
      maxFileSize: config.get<number>('indexing.maxFileSize', 1048576),
      autoReindex: config.get<boolean>('indexing.autoReindex', false)
    };
  }

  /**
   * Get retrieval configuration
   */
  static getRetrievalConfig() {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    
    return {
      topK: config.get<number>('retrieval.topK', 5),
      similarityThreshold: config.get<number>('retrieval.similarityThreshold', 0.3),
      maxContextLength: config.get<number>('retrieval.maxContextLength', 2000)
    };
  }

  /**
   * Get UI configuration
   */
  static getUIConfig() {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    
    return {
      hoverEnabled: config.get<boolean>('ui.hoverEnabled', true),
      sidePanelEnabled: config.get<boolean>('ui.sidePanelEnabled', true),
      maxHoverLines: config.get<number>('ui.maxHoverLines', 3),
      dynamicUpdates: config.get<boolean>('ui.dynamicUpdates', true)
    };
  }

  /**
   * Get cache configuration
   */
  static getCacheConfig() {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    
    return {
      enabled: config.get<boolean>('cache.enabled', true),
      ttlMinutes: config.get<number>('cache.ttlMinutes', 30)
    };
  }

  /**
   * Get logging configuration
   */
  static getLoggingConfig() {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    
    return {
      level: config.get<string>('logging.level', 'info')
    };
  }

  /**
   * Watch for configuration changes
   */
  static onConfigurationChanged(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.CONFIGURATION_SECTION)) {
        callback(e);
      }
    });
  }

  /**
   * Check if a specific configuration section has changed
   */
  static hasConfigurationChanged(e: vscode.ConfigurationChangeEvent, section: string): boolean {
    return e.affectsConfiguration(`${this.CONFIGURATION_SECTION}.${section}`);
  }

  /**
   * Get workspace-specific configuration
   * This allows different settings per workspace folder in multi-root workspaces
   */
  static getWorkspaceConfiguration(workspaceFolder?: vscode.WorkspaceFolder): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION, workspaceFolder);

    return {
      indexing: {
        includePaths: config.get<string[]>('indexing.includePaths', ['README.md', 'docs/**/*.md']),
        excludePaths: config.get<string[]>('indexing.excludePaths', ['node_modules/**', '.git/**', 'dist/**', 'build/**']),
        maxFileSize: config.get<number>('indexing.maxFileSize', 1048576),
        autoReindex: config.get<boolean>('indexing.autoReindex', false)
      },
      retrieval: {
        topK: config.get<number>('retrieval.topK', 5),
        similarityThreshold: config.get<number>('retrieval.similarityThreshold', 0.3),
        maxContextLength: config.get<number>('retrieval.maxContextLength', 2000)
      },
      ui: {
        hoverEnabled: config.get<boolean>('ui.hoverEnabled', true),
        sidePanelEnabled: config.get<boolean>('ui.sidePanelEnabled', true),
        maxHoverLines: config.get<number>('ui.maxHoverLines', 3)
      }
    };
  }

  /**
   * Update a configuration value
   */
  static async updateConfiguration(
    section: string, 
    value: any, 
    configurationTarget: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    await config.update(section, value, configurationTarget);
  }

  /**
   * Reset configuration to defaults
   */
  static async resetConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
    
    // Reset all configuration values to undefined (which uses defaults)
    const sections = [
      'indexing.includePaths',
      'indexing.excludePaths', 
      'indexing.maxFileSize',
      'indexing.autoReindex',
      'retrieval.topK',
      'retrieval.similarityThreshold',
      'retrieval.maxContextLength',
      'ui.hoverEnabled',
      'ui.sidePanelEnabled',
      'ui.maxHoverLines',
      'ui.dynamicUpdates',
      'cache.enabled',
      'cache.ttlMinutes',
      'logging.level'
    ];

    for (const section of sections) {
      await config.update(section, undefined, vscode.ConfigurationTarget.Workspace);
    }
  }

  /**
   * Validate configuration values
   */
  static validateConfiguration(): { isValid: boolean; errors: string[] } {
    const config = this.getConfiguration();
    const errors: string[] = [];

    // Validate indexing configuration
    if (config.indexing.maxFileSize <= 0) {
      errors.push('indexing.maxFileSize must be greater than 0');
    }

    if (config.indexing.maxFileSize > 100 * 1024 * 1024) { // 100MB
      errors.push('indexing.maxFileSize should not exceed 100MB for performance reasons');
    }

    // Validate retrieval configuration
    if (config.retrieval.topK <= 0 || config.retrieval.topK > 20) {
      errors.push('retrieval.topK must be between 1 and 20');
    }

    if (config.retrieval.similarityThreshold < 0 || config.retrieval.similarityThreshold > 1) {
      errors.push('retrieval.similarityThreshold must be between 0.0 and 1.0');
    }

    if (config.retrieval.maxContextLength <= 0) {
      errors.push('retrieval.maxContextLength must be greater than 0');
    }

    // Validate UI configuration
    if (config.ui.maxHoverLines <= 0 || config.ui.maxHoverLines > 10) {
      errors.push('ui.maxHoverLines must be between 1 and 10');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration summary for debugging
   */
  static getConfigurationSummary(): string {
    const config = this.getConfiguration();
    
    return `AI Docs Interpreter Configuration:
Indexing:
  - Include Paths: ${config.indexing.includePaths.join(', ')}
  - Exclude Paths: ${config.indexing.excludePaths.join(', ')}
  - Max File Size: ${(config.indexing.maxFileSize / 1024 / 1024).toFixed(1)}MB
  - Auto Reindex: ${config.indexing.autoReindex}

Retrieval:
  - Top K: ${config.retrieval.topK}
  - Similarity Threshold: ${config.retrieval.similarityThreshold}
  - Max Context Length: ${config.retrieval.maxContextLength}

UI:
  - Hover Enabled: ${config.ui.hoverEnabled}
  - Side Panel Enabled: ${config.ui.sidePanelEnabled}
  - Max Hover Lines: ${config.ui.maxHoverLines}`;
  }
}
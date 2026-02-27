/**
 * Comprehensive logging utility for AI Docs Interpreter
 * Provides structured logging with different levels and component tracking
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logEntries: LogEntry[] = [];
  private maxLogEntries: number = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set the minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Log a debug message
   */
  debug(component: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, component, message, data);
  }

  /**
   * Log an info message
   */
  info(component: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, component, message, data);
  }

  /**
   * Log a warning message
   */
  warn(component: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, component, message, data);
  }

  /**
   * Log an error message
   */
  error(component: string, message: string, error?: Error, data?: any): void {
    this.log(LogLevel.ERROR, component, message, data, error);
  }

  /**
   * Log a fatal error message
   */
  fatal(component: string, message: string, error?: Error, data?: any): void {
    this.log(LogLevel.FATAL, component, message, data, error);
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, component: string, message: string, data?: any, error?: Error): void {
    if (level < this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      data,
      error
    };

    // Add to internal log storage
    this.logEntries.push(logEntry);

    // Maintain max log entries
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.shift();
    }

    // Output to console based on level
    const levelName = LogLevel[level];
    const timestamp = logEntry.timestamp.toISOString();
    const logMessage = `[${timestamp}] ${levelName} [${component}] ${message}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, data);
        break;
      case LogLevel.INFO:
        console.info(logMessage, data);
        break;
      case LogLevel.WARN:
        console.warn(logMessage, data);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(logMessage, error || data);
        if (error && error.stack) {
          console.error('Stack trace:', error.stack);
        }
        break;
    }
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logEntries.slice(-count);
  }

  /**
   * Get logs for a specific component
   */
  getComponentLogs(component: string, count: number = 100): LogEntry[] {
    return this.logEntries
      .filter(entry => entry.component === component)
      .slice(-count);
  }

  /**
   * Get error logs only
   */
  getErrorLogs(count: number = 100): LogEntry[] {
    return this.logEntries
      .filter(entry => entry.level >= LogLevel.ERROR)
      .slice(-count);
  }

  /**
   * Clear all log entries
   */
  clearLogs(): void {
    this.logEntries = [];
  }

  /**
   * Get log statistics
   */
  getLogStats(): { [key: string]: number } {
    const stats: { [key: string]: number } = {};
    
    for (const level of Object.values(LogLevel)) {
      if (typeof level === 'number') {
        stats[LogLevel[level]] = this.logEntries.filter(entry => entry.level === level).length;
      }
    }

    return stats;
  }

  /**
   * Create a component-specific logger
   */
  createComponentLogger(component: string): ComponentLogger {
    return new ComponentLogger(this, component);
  }
}

/**
 * Component-specific logger that automatically includes component name
 */
export class ComponentLogger {
  constructor(private logger: Logger, private component: string) {}

  debug(message: string, data?: any): void {
    this.logger.debug(this.component, message, data);
  }

  info(message: string, data?: any): void {
    this.logger.info(this.component, message, data);
  }

  warn(message: string, error?: Error, data?: any): void {
    // If error is provided, include it in the data
    const logData = error ? { ...data, error: error.message } : data;
    this.logger.warn(this.component, message, logData);
  }

  error(message: string, error?: Error, data?: any): void {
    this.logger.error(this.component, message, error, data);
  }

  fatal(message: string, error?: Error, data?: any): void {
    this.logger.fatal(this.component, message, error, data);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
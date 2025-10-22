package logger

import (
	"fmt"
	"log"
	"os"
)

// Logger provides structured logging
type Logger struct {
	level   string
	verbose bool
}

// NewLogger creates a new logger
func NewLogger(level string, verbose bool) *Logger {
	return &Logger{
		level:   level,
		verbose: verbose,
	}
}

// Info logs an info message
func (l *Logger) Info(format string, args ...interface{}) {
	log.Printf("[INFO] "+format, args...)
}

// Error logs an error message
func (l *Logger) Error(format string, args ...interface{}) {
	log.Printf("[ERROR] "+format, args...)
}

// Debug logs a debug message (only if verbose)
func (l *Logger) Debug(format string, args ...interface{}) {
	if l.verbose {
		log.Printf("[DEBUG] "+format, args...)
	}
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "[FATAL] "+format+"\n", args...)
	os.Exit(1)
}

package events

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// Stream은 NDJSON 이벤트 스트림을 관리합니다
type Stream struct {
	enabled bool
}

// NewStream creates a new event stream
func NewStream(enabled bool) *Stream {
	return &Stream{enabled: enabled}
}

// Emit sends an event to stdout as NDJSON
func (s *Stream) Emit(eventType, message string, data map[string]interface{}) error {
	if !s.enabled {
		return nil
	}

	event := Event{
		Type:      eventType,
		Timestamp: time.Now(),
		Message:   message,
		Data:      data,
	}

	jsonBytes, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	// NDJSON: 한 줄에 하나의 JSON
	fmt.Fprintln(os.Stdout, string(jsonBytes))
	return nil
}

// Progress emits a progress event
func (s *Stream) Progress(message string, percent int) error {
	return s.Emit(TypeProgress, message, map[string]interface{}{
		"percent": percent,
	})
}

// Error emits an error event
func (s *Stream) Error(message string, err error) error {
	if err != nil {
		return s.Emit(TypeError, message, map[string]interface{}{
			"error": err.Error(),
		})
	}
	return s.Emit(TypeError, message, nil)
}

// ErrorStr emits an error event with string message
func (s *Stream) ErrorStr(message string) error {
	return s.Emit(TypeError, message, nil)
}

// Log emits a log event
func (s *Stream) Log(message string) error {
	return s.Emit(TypeLog, message, nil)
}

// Success emits a success event
func (s *Stream) Success(message string) error {
	return s.Emit(TypeSuccess, message, nil)
}

// Info emits an info/log event
func (s *Stream) Info(message string) error {
	return s.Emit(TypeLog, message, nil)
}

package events

import "time"

// Event는 GUI로 전송되는 이벤트입니다
type Event struct {
	Type      string                 `json:"type"`      // progress, log, error, success
	Timestamp time.Time              `json:"timestamp"`
	Message   string                 `json:"message"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

// EventType constants
const (
	TypeProgress = "progress"
	TypeError    = "error"
	TypeLog      = "log"
	TypeSuccess  = "success"
	TypeWarning  = "warning"
)

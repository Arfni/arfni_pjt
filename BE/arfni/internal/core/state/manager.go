package state

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const stateDir = ".arfni"
const stateFile = "state.json"

// Manager manages deployment state
type Manager struct {
	stateFilePath string
}

// NewManager creates a new state manager
func NewManager(workdir string) *Manager {
	return &Manager{
		stateFilePath: filepath.Join(workdir, stateDir, stateFile),
	}
}

// Load loads the current state
func (m *Manager) Load() (*DeploymentState, error) {
	data, err := os.ReadFile(m.stateFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No state file yet
		}
		return nil, fmt.Errorf("failed to read state file: %w", err)
	}

	var state DeploymentState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("failed to parse state file: %w", err)
	}

	return &state, nil
}

// Save saves the current state
func (m *Manager) Save(state *DeploymentState) error {
	// Ensure state directory exists
	dir := filepath.Dir(m.stateFilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create state directory: %w", err)
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	if err := os.WriteFile(m.stateFilePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write state file: %w", err)
	}

	return nil
}

package events

// Writer provides helper functions for writing events

var defaultStream *Stream

// Init initializes the default event stream
func Init(enabled bool) {
	defaultStream = NewStream(enabled)
}

// EmitProgress emits a progress event using default stream
func EmitProgress(message string, percent int) error {
	if defaultStream == nil {
		return nil
	}
	return defaultStream.Progress(message, percent)
}

// EmitError emits an error event using default stream
func EmitError(message string, err error) error {
	if defaultStream == nil {
		return nil
	}
	return defaultStream.Error(message, err)
}

// EmitLog emits a log event using default stream
func EmitLog(message string) error {
	if defaultStream == nil {
		return nil
	}
	return defaultStream.Log(message)
}

// EmitSuccess emits a success event using default stream
func EmitSuccess(message string) error {
	if defaultStream == nil {
		return nil
	}
	return defaultStream.Success(message)
}

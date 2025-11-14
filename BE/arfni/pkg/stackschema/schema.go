package stackschema

// Schema defines the stack.yaml JSON schema structure

const StackSchemaV01 = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["apiVersion", "name", "targets", "services"],
  "properties": {
    "apiVersion": {
      "type": "string",
      "enum": ["v0.1"]
    },
    "name": {
      "type": "string"
    },
    "targets": {
      "type": "object"
    },
    "services": {
      "type": "object"
    },
    "secrets": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "outputs": {
      "type": "object"
    }
  }
}`

// GetSchema returns the JSON schema for a given API version
func GetSchema(apiVersion string) (string, error) {
	// TODO: 버전별 스키마 반환
	return StackSchemaV01, nil
}

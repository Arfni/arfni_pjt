/**
 * Simple template engine for plugin templates
 * Supports {{variable}} substitution and {{#if}} conditionals
 */

export interface TemplateContext {
  [key: string]: any;
}

export class TemplateEngine {
  /**
   * Process a template string with the given context
   */
  static process(template: string, context: TemplateContext): string {
    let result = template;

    // Process conditionals first {{#if variable}}...{{/if}}
    result = this.processConditionals(result, context);

    // Process variable substitutions {{variable}}
    result = this.processVariables(result, context);

    return result;
  }

  private static processConditionals(template: string, context: TemplateContext): string {
    const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

    return template.replace(conditionalRegex, (match, variable, content) => {
      const value = this.getNestedValue(context, variable);
      return value ? content : '';
    });
  }

  private static processVariables(template: string, context: TemplateContext): string {
    const variableRegex = /\{\{(\w+(?:\.\w+)*)\}\}/g;

    return template.replace(variableRegex, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  private static getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Parse YAML-like template to object structure
   */
  static parseYamlTemplate(template: string, context: TemplateContext): any {
    // First process the template
    const processed = this.process(template, context);

    // Simple YAML parsing (for service templates)
    // This is a simplified parser - in production, use a proper YAML library
    const lines = processed.split('\n');
    const result: any = {};
    let currentKey: string | null = null;
    let currentIndent = 0;
    let currentObject: any = result;
    const stack: any[] = [result];

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') continue;

      const indent = line.length - line.trimStart().length;
      const trimmed = line.trim();

      // Handle key-value pairs
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();

        if (value) {
          // Simple key-value
          if (value.startsWith('[') && value.endsWith(']')) {
            // Array value
            currentObject[key] = JSON.parse(value);
          } else if (value === 'true' || value === 'false') {
            // Boolean value
            currentObject[key] = value === 'true';
          } else if (!isNaN(Number(value))) {
            // Number value
            currentObject[key] = Number(value);
          } else {
            // String value (remove quotes if present)
            currentObject[key] = value.replace(/^["']|["']$/g, '');
          }
        } else {
          // Nested object
          currentObject[key] = {};
          currentKey = key;

          if (indent > currentIndent) {
            stack.push(currentObject);
            currentObject = currentObject[key];
            currentIndent = indent;
          }
        }
      } else if (trimmed.startsWith('- ')) {
        // Array item
        const value = trimmed.substring(2);
        if (!Array.isArray(currentObject[currentKey!])) {
          currentObject[currentKey!] = [];
        }
        currentObject[currentKey!].push(value);
      }
    }

    return result;
  }
}
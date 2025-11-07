/**
 * Simple template engine for plugin templates
 * Supports {{variable}} substitution and {{#if}} conditionals
 */

import * as yaml from 'js-yaml';

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
   * Parse YAML template to object structure
   * Uses js-yaml library for proper YAML parsing
   */
  static parseYamlTemplate(template: string, context: TemplateContext): any {
    try {
      // First process template variables
      const processed = this.process(template, context);

      // Use js-yaml for proper YAML parsing
      const result = yaml.load(processed);

      return result || {};
    } catch (error) {
      console.error('Failed to parse YAML template:', error);
      console.error('Template:', template);
      throw new Error(`YAML parsing failed: ${error}`);
    }
  }
}
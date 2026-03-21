import type { Language } from "./types";

/**
 * Tree-sitter query patterns per language.
 * Captures: @item = entity node, @name = identifier, @context = signature parts
 * Adapted from Zed editor's outline.scm patterns.
 */

const TYPESCRIPT = `
(internal_module "namespace" @context name: (_) @name) @item
(enum_declaration "enum" @context name: (_) @name) @item
(type_alias_declaration "type" @context name: (_) @name) @item

(function_declaration
  "async"? @context "function" @context name: (_) @name
  parameters: (formal_parameters "(" @context ")" @context)) @item

(generator_function_declaration
  "async"? @context "function" @context "*" @context name: (_) @name
  parameters: (formal_parameters "(" @context ")" @context)) @item

(interface_declaration "interface" @context name: (_) @name) @item

(export_statement
  (lexical_declaration ["let" "const"] @context
    (variable_declarator name: (identifier) @name) @item))

(program
  (lexical_declaration ["let" "const"] @context
    (variable_declarator name: (identifier) @name) @item))

(class_declaration "class" @context name: (_) @name) @item
(abstract_class_declaration "abstract" @context "class" @context name: (_) @name) @item

(class_body
  (method_definition
    ["get" "set" "async" "*" "readonly" "static" (override_modifier) (accessibility_modifier)]* @context
    name: (_) @name
    parameters: (formal_parameters "(" @context ")" @context)) @item)

(public_field_definition
  ["declare" "readonly" "abstract" "static" (accessibility_modifier)]* @context
  name: (_) @name) @item

(export_statement
  (lexical_declaration ["let" "const"] @context
    (variable_declarator name: (identifier) @name value: (arrow_function)) @item))

(program
  (lexical_declaration ["let" "const"] @context
    (variable_declarator name: (identifier) @name value: (arrow_function)) @item))

(import_statement) @item
(export_statement (export_clause)) @item
`;

const JAVASCRIPT = `
(function_declaration name: (identifier) @name) @item
(generator_function_declaration name: (identifier) @name) @item
(class_declaration name: (identifier) @name) @item

(class_body
  (method_definition name: (property_identifier) @name) @item)

(program
  (lexical_declaration
    (variable_declarator name: (identifier) @name) @item))

(program
  (lexical_declaration
    (variable_declarator name: (identifier) @name value: (arrow_function)) @item))

(import_statement) @item
(export_statement) @item
`;

const PYTHON = `
(decorator) @annotation
(class_definition name: (identifier) @name) @item
(function_definition name: (identifier) @name) @item
(import_statement) @item
(import_from_statement) @item
`;

const RUST = `
(struct_item name: (type_identifier) @name) @item
(enum_item name: (type_identifier) @name) @item
(trait_item name: (type_identifier) @name) @item
(impl_item) @item
(function_item name: (identifier) @name) @item
(mod_item name: (identifier) @name) @item
(type_item name: (type_identifier) @name) @item
(const_item name: (identifier) @name) @item
(use_declaration) @item
`;

const GO = `
(comment) @annotation

(type_declaration "type" @context
  [(type_spec name: (_) @name) @item
   ("(" (type_spec name: (_) @name) @item ")")])

(function_declaration "func" @context name: (identifier) @name
  parameters: (parameter_list "(" ")")) @item

(method_declaration "func" @context
  receiver: (parameter_list
    "(" @context (parameter_declaration name: (_) @context type: (_) @context) ")" @context)
  name: (field_identifier) @name
  parameters: (parameter_list "(" ")")) @item

(const_declaration "const" @context
  (const_spec name: (identifier) @name) @item)

(source_file
  (var_declaration "var" @context
    [(var_spec name: (identifier) @name @item)
     (var_spec_list (var_spec name: (identifier) @name @item))]))

(method_elem name: (_) @name
  parameters: (parameter_list "(" @context ")" @context)) @item

(field_declaration name: (_) @name @item)
(import_declaration) @item
(package_clause "package" @context (package_identifier) @name) @item
`;

const JAVA = `
(package_declaration "package" @context (scoped_identifier) @name) @item
(import_declaration) @item

(class_declaration (modifiers)? @context "class" @context name: (identifier) @name) @item
(interface_declaration (modifiers)? @context "interface" @context name: (identifier) @name) @item
(record_declaration (modifiers)? @context "record" @context name: (identifier) @name) @item
(enum_declaration (modifiers)? @context "enum" @context name: (identifier) @name) @item
(enum_constant name: (identifier) @name) @item
(annotation_type_declaration (modifiers)? @context "@interface" @context name: (identifier) @name) @item

(method_declaration (modifiers)? @context type: (_) @context name: (identifier) @name
  parameters: (formal_parameters "(" @context ")" @context)) @item

(constructor_declaration (modifiers)? @context name: (identifier) @name
  parameters: (formal_parameters "(" @context ")" @context)) @item

(field_declaration (modifiers)? @context type: (_) @context
  declarator: (variable_declarator name: (identifier) @name)) @item

(static_initializer "static" @context) @item

(annotation_type_element_declaration type: (_) @context name: (identifier) @name) @item

(class_body
  (class_declaration (modifiers)? @context "class" @context name: (identifier) @name) @item)
(class_body
  (interface_declaration (modifiers)? @context "interface" @context name: (identifier) @name) @item)
(class_body
  (enum_declaration (modifiers)? @context "enum" @context name: (identifier) @name) @item)
`;

export const QUERIES: Record<Language, string> = {
  typescript: TYPESCRIPT,
  javascript: JAVASCRIPT,
  python: PYTHON,
  rust: RUST,
  go: GO,
  java: JAVA,
};

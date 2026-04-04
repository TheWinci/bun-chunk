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

// --- New languages ---

const C = `
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name)) @item

(function_definition
  declarator: (pointer_declarator
    declarator: (function_declarator
      declarator: (identifier) @name))) @item

(declaration
  declarator: (function_declarator
    declarator: (identifier) @name)) @item

(struct_specifier name: (type_identifier) @name) @item
(enum_specifier name: (type_identifier) @name) @item
(union_specifier name: (type_identifier) @name) @item
(type_definition declarator: (type_identifier) @name) @item

(preproc_include) @item
(preproc_def name: (identifier) @name) @item
(preproc_function_def name: (identifier) @name) @item
`;

const CPP = `
(function_definition
  declarator: (function_declarator
    declarator: (qualified_identifier) @name)) @item

(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name)) @item

(function_definition
  declarator: (pointer_declarator
    declarator: (function_declarator
      declarator: (identifier) @name))) @item

(declaration
  declarator: (function_declarator
    declarator: (identifier) @name)) @item

(class_specifier name: (type_identifier) @name) @item
(struct_specifier name: (type_identifier) @name) @item
(enum_specifier name: (type_identifier) @name) @item
(union_specifier name: (type_identifier) @name) @item

(namespace_definition name: (namespace_identifier) @name) @item

(type_definition declarator: (type_identifier) @name) @item

(preproc_include) @item
(preproc_def name: (identifier) @name) @item
`;

const CSHARP = `
(class_declaration name: (identifier) @name) @item
(interface_declaration name: (identifier) @name) @item
(struct_declaration name: (identifier) @name) @item
(enum_declaration name: (identifier) @name) @item
(record_declaration name: (identifier) @name) @item
(namespace_declaration name: (_) @name) @item

(method_declaration name: (identifier) @name) @item
(constructor_declaration name: (identifier) @name) @item
(property_declaration name: (identifier) @name) @item
(field_declaration
  (variable_declaration
    (variable_declarator (identifier) @name))) @item
(event_declaration name: (identifier) @name) @item
(delegate_declaration name: (identifier) @name) @item

(using_directive) @item
`;

const RUBY = `
(class name: (constant) @name) @item
(module name: (constant) @name) @item
(method name: (identifier) @name) @item
(singleton_method name: (identifier) @name) @item
`;

const PHP = `
(class_declaration name: (name) @name) @item
(interface_declaration name: (name) @name) @item
(trait_declaration name: (name) @name) @item
(enum_declaration name: (name) @name) @item

(function_definition name: (name) @name) @item
(method_declaration name: (name) @name) @item

(namespace_definition name: (namespace_name) @name) @item
(namespace_use_declaration) @item
`;


const SCALA = `
(class_definition name: (identifier) @name) @item
(object_definition name: (identifier) @name) @item
(trait_definition name: (identifier) @name) @item

(function_definition name: (identifier) @name) @item

(import_declaration) @item
(package_clause (package_identifier) @name) @item
`;

const HTML = `
(element
  (start_tag (tag_name) @name)) @item
`;

const CSS = `
(rule_set
  (selectors) @name) @item

(media_statement) @item
(import_statement) @item
(keyframes_statement
  (keyframes_name) @name) @item
`;

const KOTLIN = `
(import) @item
(package_header) @item

(class_declaration (identifier) @name) @item
(object_declaration (identifier) @name) @item

(function_declaration (identifier) @name) @item

(source_file (property_declaration) @item)
`;

const LUA = `
(function_declaration name: (_) @name) @item

(variable_declaration
  (assignment_statement
    (variable_list (identifier) @name)
    (expression_list (function_definition)))) @item

(variable_declaration
  (assignment_statement
    (variable_list (identifier) @name))) @item
`;

const ZIG = `
(source_file (function_declaration (identifier) @name) @item)

(source_file (variable_declaration (identifier) @name) @item)

(source_file (test_declaration) @item)
`;

const ELIXIR = `
(call
  target: (identifier) @context
  (arguments (alias) @name)
  (#match? @context "^(defmodule|defprotocol|defimpl)$")) @item

(call
  target: (identifier) @context
  (arguments
    (call target: (identifier) @name))
  (#match? @context "^(def|defp|defmacro|defmacrop|defguard|defguardp|defdelegate)$")) @item

(call
  target: (identifier) @context
  (#match? @context "^(import|alias|use|require)$")) @item
`;

const BASH = `
(function_definition name: (word) @name) @item
(variable_assignment name: (variable_name) @name) @item
`;

const TOML = `
(table (bare_key) @name) @item
(table (dotted_key) @name) @item
(table_array_element (bare_key) @name) @item
(table_array_element (dotted_key) @name) @item
(pair (bare_key) @name) @item
(pair (dotted_key) @name) @item
`;

const YAML = `
(block_mapping_pair
  key: (_) @name) @item
`;

const HASKELL = `
(function name: (variable) @name) @item
(signature name: (variable) @name) @item

(data_type name: (_) @name) @item
(newtype name: (_) @name) @item
(type_synomym name: (_) @name) @item

(class) @item
(instance) @item

(import) @item
`;

const OCAML = `
(value_definition
  (let_binding pattern: (value_name) @name)) @item

(type_definition
  (type_binding name: (type_constructor) @name)) @item

(module_definition
  (module_binding (module_name) @name)) @item

(open_module) @item

(external (value_name) @name) @item

(exception_definition
  (constructor_declaration (constructor_name) @name)) @item
`;

const DART = `
(class_definition name: (identifier) @name) @item
(enum_declaration name: (identifier) @name) @item
(mixin_declaration (identifier) @name) @item
(extension_declaration (identifier) @name) @item

(program (function_signature name: (identifier) @name) @item)

(import_or_export) @item
`;

export const QUERIES: Record<Language, string> = {
  typescript: TYPESCRIPT,
  javascript: JAVASCRIPT,
  python: PYTHON,
  rust: RUST,
  go: GO,
  java: JAVA,
  c: C,
  cpp: CPP,
  csharp: CSHARP,
  ruby: RUBY,
  php: PHP,
  scala: SCALA,
  html: HTML,
  css: CSS,
  kotlin: KOTLIN,
  lua: LUA,
  zig: ZIG,
  elixir: ELIXIR,
  bash: BASH,
  toml: TOML,
  yaml: YAML,
  haskell: HASKELL,
  ocaml: OCAML,
  dart: DART,
};

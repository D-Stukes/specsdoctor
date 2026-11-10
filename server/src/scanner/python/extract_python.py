#!/usr/bin/env python3
"""Task 8 / T20: the Python half of the Scanner support matrix - def, class, methods, __all__,
type hints, docstrings, os.environ/os.getenv literals (see docs/DocSync-Technical-Design.md §2).
Standard library only (ast), invoked by server/src/scanner/python-bridge.js as a subprocess.
Reads source on stdin, writes one JSON object to stdout: {items, env_refs, flagged_patterns} or
{error, message} on a syntax error. Facts only - no judgment, no prose; that belongs to the AI
stages downstream, per the project's own rule 1 ("code reads, AI explains").
"""
import ast
import json
import sys


def type_str(node):
    if node is None:
        return None
    try:
        return ast.unparse(node)
    except Exception:
        return None


def params_of(fn, skip_first=False):
    args = fn.args.args[1:] if skip_first and fn.args.args else fn.args.args
    return [{"name": a.arg, "type": type_str(a.annotation), "default": None} for a in args]


def literal_strings(node):
    """Every literal string found in a List/Tuple anywhere inside this expression, including
    through a BinOp (concatenation) we otherwise can't fully resolve - conservative over-
    collection, so a name definitely present in the literal part of `["a"] + dynamic` still
    counts as confirmed, even though the full set of names __all__ ends up with isn't known."""
    found = set()
    if isinstance(node, (ast.List, ast.Tuple)):
        for e in node.elts:
            if isinstance(e, ast.Constant) and isinstance(e.value, str):
                found.add(e.value)
    elif isinstance(node, ast.BinOp):
        found |= literal_strings(node.left)
        found |= literal_strings(node.right)
    return found


def resolve_all(tree):
    """A literal list/tuple of string constants is fully resolvable. Anything else
    (concatenation, a conditional, a variable) is flagged dynamic_all - but a name that's
    confirmed present in a *literal part* of that expression is still treated as exported; a
    name that never appears in any literal part is not (matching the fixture's own expectation:
    `__all__ = ["core_helper"] + _extra` confirms core_helper, not extra_helper)."""
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(t, ast.Name) and t.id == "__all__" for t in node.targets):
            continue
        value = node.value
        if isinstance(value, (ast.List, ast.Tuple)) and all(isinstance(e, ast.Constant) and isinstance(e.value, str) for e in value.elts):
            return set(e.value for e in value.elts), None
        return literal_strings(value), {"line": node.lineno, "pattern": "dynamic_all"}
    return None, None


def env_refs_of(tree):
    refs = []
    for node in ast.walk(tree):
        # os.environ["NAME"]
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Attribute) and node.value.attr == "environ":
            key = node.slice
            if isinstance(key, ast.Constant) and isinstance(key.value, str):
                refs.append({"name": key.value, "line": node.lineno})
        # os.getenv("NAME", ...)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "getenv":
            if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                refs.append({"name": node.args[0].value, "line": node.lineno})
    return refs


def function_item(node, kind, exported):
    return {
        "kind": kind,
        "name": node.name,
        "start_line": node.lineno,
        "end_line": node.end_lineno,
        "exported": exported,
        "documented": ast.get_docstring(node) is not None,
        "doc": ast.get_docstring(node),
        "params": params_of(node, skip_first=(kind == "method")),
        "returns": type_str(node.returns),
    }


def extract(source):
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return {"error": "parse_error", "message": str(e)}

    exported_names, dynamic_all_flag = resolve_all(tree)

    def is_exported(name):
        return (name in exported_names) if exported_names is not None else not name.startswith("_")

    items = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            items.append(function_item(node, "function", is_exported(node.name)))
        elif isinstance(node, ast.ClassDef):
            class_exported = is_exported(node.name)
            items.append({
                "kind": "class",
                "name": node.name,
                "start_line": node.lineno,
                "end_line": node.end_lineno,
                "exported": class_exported,
                "documented": ast.get_docstring(node) is not None,
                "doc": ast.get_docstring(node),
                "params": [],
                "returns": None,
            })
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    item = function_item(member, "method", class_exported)
                    item["name"] = f"{node.name}.{member.name}"
                    items.append(item)

    return {
        "items": items,
        "env_refs": env_refs_of(tree),
        "flagged_patterns": [dynamic_all_flag] if dynamic_all_flag else [],
    }


if __name__ == "__main__":
    print(json.dumps(extract(sys.stdin.read())))

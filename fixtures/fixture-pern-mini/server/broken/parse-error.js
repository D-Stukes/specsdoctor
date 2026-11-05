// Intentional syntax error: the Scanner must record this as a parse error
// (status "failed"), not crash the whole run.
function broken( {
  return "missing closing paren above, and no function body end"

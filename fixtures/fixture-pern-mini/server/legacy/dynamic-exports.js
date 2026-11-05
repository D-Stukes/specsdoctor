function featureA() {
  return "a";
}

function featureB() {
  return "b";
}

// Dynamic env var access: the key is a variable, not a string literal, so
// the Scanner cannot record which env var this is and flags it instead.
const envKey = "FEATURE_EXPORT_NAME";
const dynamicEnvValue = process.env[envKey];

// Dynamic export key: the Scanner cannot determine the exported name
// statically, so this is flagged rather than extracted.
const exportName = dynamicEnvValue || "featureA";
module.exports[exportName] = exportName === "featureA" ? featureA : featureB;

// Conditional export: which branch runs depends on a runtime value, so the
// Scanner flags this instead of guessing which function is exported.
if (process.env.NODE_ENV === "production") {
  module.exports.feature = featureA;
} else {
  module.exports.feature = featureB;
}

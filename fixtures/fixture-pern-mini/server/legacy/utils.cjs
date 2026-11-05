function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, "-");
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

exports.slugify = slugify;
module.exports.truncate = truncate;

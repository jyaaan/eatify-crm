
exports.up = function(knex, Promise) {
  const alter = knex.schema.alterTable('users', table => {
    table.string('picture_url', 1000).alter();
    table.string('external_url', 1000).alter();
    table.string('full_name', 1000).alter();
  });

  return alter;
};

exports.down = function(knex, Promise) {
  const alter = knex.schema.alterTable('users', table => {
    table.string('picture_url', 255).alter();
    table.string('external_url', 255).alter();
    table.string('full_name', 255).alter();
  });

  return alter;  
};

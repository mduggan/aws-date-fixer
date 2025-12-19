//
// URLs which have dates based on the user's browser locale
//
const AUTO_URLS = [
  /\/gluestudio\/home\?.*\/jobs$/, // Glue studio job creations
  /\/rds\/home.*#.*(database:id=|automatedbackups|snapshots-list|event-list|ca-cert-update)/, // All the RDS DB tabs, long format
  /\/dynamodbv2\/home\?.*tab=backups$/, // Dynamo backup dates, long format
];

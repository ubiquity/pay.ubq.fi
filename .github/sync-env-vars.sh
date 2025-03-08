#!/bin/bash

# Check if required environment variables are set
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$GITHUB_REPOSITORY" ] || \
   [ -z "$RELOADLY_API_CLIENT_ID" ] || [ -z "$RELOADLY_API_CLIENT_SECRET" ] || \
   [ -z "$RELOADLY_SANDBOX_API_CLIENT_ID" ] || [ -z "$RELOADLY_SANDBOX_API_CLIENT_SECRET" ]; then
    echo "Error: Required environment variables are not set"
    exit 1
fi

# Extract just the repository name from org/repo format
REPOSITORY_NAME=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f2)
# Replace dots with hyphens
REPOSITORY_NAME=${REPOSITORY_NAME//./-}

# Echo the repository name
echo "Repository name: $REPOSITORY_NAME"

# Make the API call to Cloudflare
curl -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${REPOSITORY_NAME}/deployment_configs" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "deployment_configs": {
      "production": {
        "env_vars": {
          "USE_RELOADLY_SANDBOX": {
            "value": "false",
            "type": "plain_text"
          },
          "RELOADLY_API_CLIENT_ID": {
            "value": "'"${RELOADLY_API_CLIENT_ID}"'",
            "type": "secret_text"
          },
          "RELOADLY_API_CLIENT_SECRET": {
            "value": "'"${RELOADLY_API_CLIENT_SECRET}"'",
            "type": "secret_text"
          }
        }
      },
      "preview": {
        "env_vars": {
          "USE_RELOADLY_SANDBOX": {
            "value": "true",
            "type": "plain_text"
          },
          "RELOADLY_API_CLIENT_ID": {
            "value": "'"${RELOADLY_SANDBOX_API_CLIENT_ID}"'",
            "type": "secret_text"
          },
          "RELOADLY_API_CLIENT_SECRET": {
            "value": "'"${RELOADLY_SANDBOX_API_CLIENT_SECRET}"'",
            "type": "secret_text"
          }
        }
      }
    }
  }'
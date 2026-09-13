#!/bin/bash
# Run interactively on your Mac. Credentials go directly to GitHub over stdin.
set -euo pipefail
set +x
repository=CornerSkyless/GitOK
environment=apple-release

gh auth status >/dev/null
gh api "repos/$repository/environments/$environment" >/dev/null
printf 'Destination: %s / environment: %s\n' "$repository" "$environment"
read -r -p 'Absolute path to the exported Developer ID Application .p12: ' certificate_path
if [[ "$certificate_path" != /* ]] || [ ! -f "$certificate_path" ]; then
  echo 'Please use the absolute path to an existing .p12 file.' >&2
  exit 1
fi
if [ "$(wc -c < "$certificate_path")" -gt 36000 ]; then
  echo 'Export only the Developer ID Application identity; this file is too large for a GitHub Secret.' >&2
  exit 1
fi

read -r -s -p 'Password used when exporting the .p12 (hidden): ' certificate_password
printf '\n'
read -r -p 'Apple account email for notarization: ' apple_id
read -r -p 'Apple Developer Team ID (10 characters): ' team_id
read -r -s -p 'App-specific password generated for GitOK (hidden): ' notary_password
printf '\n'
trap 'unset certificate_password notary_password' EXIT
if [ -z "$certificate_password" ] || [ -z "$apple_id" ] || [ -z "$notary_password" ] || [[ ! "$team_id" =~ ^[A-Z0-9]{10}$ ]]; then
  echo 'All fields are required; Team ID must contain 10 uppercase letters/digits.' >&2
  exit 1
fi

base64 -i "$certificate_path" | gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo "$repository" --env "$environment"
printf '%s' "$certificate_password" | gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$repository" --env "$environment"
printf '%s' "$apple_id" | gh secret set APPLE_ID --repo "$repository" --env "$environment"
printf '%s' "$team_id" | gh secret set APPLE_TEAM_ID --repo "$repository" --env "$environment"
printf '%s' "$notary_password" | gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo "$repository" --env "$environment"
echo 'Five environment secrets saved. No release was triggered.'

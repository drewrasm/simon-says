#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker compose -f "$script_dir/compose.yaml" run --rm --no-deps --entrypoint /bin/sh storage-init -ec '
  endpoint=http://storage:8333
  probe_dir=$(mktemp -d)
  probe_key="verification/$(basename "$probe_dir")"
  cleanup() {
    aws --endpoint-url "$endpoint" s3api delete-object --bucket simon-says --key "$probe_key" >/dev/null
  }
  trap cleanup EXIT

  printf "private storage verification\n" > "$probe_dir/input"
  aws --endpoint-url "$endpoint" s3api put-object --bucket simon-says --key "$probe_key" --body "$probe_dir/input" >/dev/null
  aws --endpoint-url "$endpoint" s3api get-object --bucket simon-says --key "$probe_key" "$probe_dir/output" >/dev/null
  cmp "$probe_dir/input" "$probe_dir/output"

  status=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint/simon-says/$probe_key")
  [ "$status" = 403 ] || { printf "Anonymous request returned %s, expected 403\n" "$status" >&2; exit 1; }
  printf "Signed put/get matched; anonymous request returned 403.\n"
'

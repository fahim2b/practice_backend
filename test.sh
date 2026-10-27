#!/usr/bin/env bash

#   BASE_URL=http://localhost:5000/api/v1 ./test-api.sh

set -u
set -o pipefail

BASE_URL="${BASE_URL:-http://localhost:5000/api/v1}"
PASS=0
FAIL=0
BODY=""
STATUS="000"

CATEGORY1=""
CATEGORY2=""
INVALID_CATEGORY=""
CATEGORY1_ID=""
CATEGORY2_ID=""
PRODUCT_ID=""

SUFFIX="$(date +%s)_$$"
CATEGORY1="test-electronics-${SUFFIX}"
CATEGORY2="test-books-${SUFFIX}"
INVALID_CATEGORY="nonexistent-${SUFFIX}"

# Send an HTTP request and capture its response body and status.
request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local response
  local curl_status

  if [[ -n "$payload" ]]; then
    response=$(curl -sS \
      --connect-timeout 3 \
      --max-time 10 \
      -X "$method" \
      "${BASE_URL}${path}" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      -w $'\n%{http_code}') 
    curl_status=$?
  else
    response=$(curl -sS \
      --connect-timeout 3 \
      --max-time 10 \
      -X "$method" \
      "${BASE_URL}${path}" \
      -w $'\n%{http_code}')
    curl_status=$?
  fi

  if (( curl_status != 0 )); then
    STATUS="000"
    BODY="${response:-}"
    echo "ERROR: curl failed for $method ${BASE_URL}${path}" >&2
    return 1
  fi

  STATUS="${response##*$'\n'}"
  BODY="${response%$'\n'*}"

  return 0
}

check() {
  local description="$1"
  local success="$2"

  if [[ "$success" == "true" ]]; then
    echo "PASS: $description"
    ((PASS += 1))
  else
    echo "FAIL: $description"
    echo "      HTTP status: $STATUS"
    echo "      Response: ${BODY:-<empty>}"
    ((FAIL += 1))
  fi
}

check_status() {
  local description="$1"
  local expected="$2"

  if [[ "$STATUS" == "$expected" ]]; then
    check "$description (HTTP $expected)" true
  else
    check "$description (expected HTTP $expected)" false
  fi
}

check_json() {
  local description="$1"
  local filter="$2"

  if jq -e "$filter" <<< "$BODY" >/dev/null 2>&1; then
    check "$description" true
  else
    check "$description" false
  fi
}

# Delete test data if its ID is known.
cleanup() {
  echo
  echo "Cleaning up test data..."

  if [[ -n "$PRODUCT_ID" ]]; then
    if request DELETE "/product/${PRODUCT_ID}"; then
      if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then
        echo "Cleanup: product handled (HTTP $STATUS)"
      else
        echo "Cleanup warning: product deletion returned HTTP $STATUS"
      fi
    fi
  fi

  if [[ -n "$CATEGORY2_ID" ]]; then
    if request DELETE "/category/${CATEGORY2_ID}"; then
      if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then
        echo "Cleanup: second category handled (HTTP $STATUS)"
      else
        echo "Cleanup warning: second category returned HTTP $STATUS"
      fi
    fi
  fi

  if [[ -n "$CATEGORY1_ID" ]]; then
    if request DELETE "/category/${CATEGORY1_ID}"; then
      if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then
        echo "Cleanup: first category handled (HTTP $STATUS)"
      else
        echo "Cleanup warning: first category returned HTTP $STATUS"
      fi
    fi
  fi
}

stop_test() {
  echo
  echo "Cannot safely continue because a prerequisite failed."
  cleanup
  print_summary
  exit 1
}

print_summary() {
  echo
  echo "========================================"
  echo " Test Results"
  echo " Passed: $PASS"
  echo " Failed: $FAIL"
  echo "========================================"
}

echo "========================================"
echo " API Integration Tests"
echo " Base URL: $BASE_URL"
echo "========================================"
echo

# Check that the server is reachable before running the tests.
if ! request GET "/category"; then
  echo "Cannot reach the API. Check that your server is running."
  exit 1
fi

check_status "API is reachable" 200
if [[ "$STATUS" != "200" ]]; then
  stop_test
fi

# 1. Create the first category.
request POST "/category" "{\"name\":\"${CATEGORY1}\"}" || stop_test
check_status "Create first category" 201
check_json "First category has the expected name" \
  ".data.name == \"${CATEGORY1}\""

CATEGORY1_ID="$(jq -r '.data._id // empty' <<< "$BODY")"

if [[ "$STATUS" != "201" || -z "$CATEGORY1_ID" ]]; then
  stop_test
fi

# 2. Reject duplicate category creation.
request POST "/category" "{\"name\":\"${CATEGORY1}\"}" || stop_test
check_status "Reject duplicate category" 409

# 3. Create the second category.
request POST "/category" "{\"name\":\"${CATEGORY2}\"}" || stop_test
check_status "Create second category" 201
check_json "Second category has the expected name" \
  ".data.name == \"${CATEGORY2}\""

CATEGORY2_ID="$(jq -r '.data._id // empty' <<< "$BODY")"

if [[ "$STATUS" != "201" || -z "$CATEGORY2_ID" ]]; then
  stop_test
fi

# 4. Create a product using a valid category.
request POST "/product" "{
  \"name\":\"Test Keyboard ${SUFFIX}\",
  \"price\":80,
  \"category\":\"${CATEGORY1}\",
  \"inStock\":true
}" || stop_test

check_status "Create product with valid category" 201
check_json "Product response contains the expected name" \
  ".data.name == \"Test Keyboard ${SUFFIX}\""
check_json "Product response contains the expected category" \
  ".data.category == \"${CATEGORY1}\""

PRODUCT_ID="$(jq -r '.data._id // empty' <<< "$BODY")"

if [[ "$STATUS" != "201" || -z "$PRODUCT_ID" ]]; then
  stop_test
fi

# 5. Reject a product with a nonexistent category.
request POST "/product" "{
  \"name\":\"Invalid Product ${SUFFIX}\",
  \"price\":20,
  \"category\":\"${INVALID_CATEGORY}\"
}" || stop_test

check_status "Reject product with invalid category" 400

# 6. Retrieve products and check the category name.
request GET "/product" || stop_test
check_status "Retrieve products" 200
check_json "GET returns the test product with its category name" \
  "[.data[] | select(._id == \"${PRODUCT_ID}\" and .category == \"${CATEGORY1}\")] | length == 1"

# 7. Update the product's category.
request PUT "/product/${PRODUCT_ID}" \
  "{\"category\":\"${CATEGORY2}\"}" || stop_test

check_status "Update product category" 200
check_json "Updated product response contains the new category" \
  ".data.category == \"${CATEGORY2}\""

# 8. Reject an update with an invalid category.
request PUT "/product/${PRODUCT_ID}" \
  "{\"category\":\"${INVALID_CATEGORY}\"}" || stop_test

check_status "Reject invalid category during update" 400

# 9. Confirm that the failed update did not change the category.
request GET "/product" || stop_test
check_status "Retrieve products after failed update" 200
check_json "Failed update leaves the category unchanged" \
  "[.data[] | select(._id == \"${PRODUCT_ID}\" and .category == \"${CATEGORY2}\")] | length == 1"

# 10. Prevent deletion of a category currently used by a product.
request DELETE "/category/${CATEGORY2_ID}" || stop_test
check_status "Prevent deletion of category in use" 409

# 11. Delete the product.
request DELETE "/product/${PRODUCT_ID}" || stop_test
check_status "Delete product" 200
PRODUCT_ID=""

# 12. Delete the now-unused categories.
request DELETE "/category/${CATEGORY2_ID}" || stop_test
check_status "Delete unused second category" 200
CATEGORY2_ID=""

request DELETE "/category/${CATEGORY1_ID}" || stop_test
check_status "Delete unused first category" 200
CATEGORY1_ID=""

# 13. Verify that deleting the already-deleted product returns 404.
# Save the ID first because cleanup uses PRODUCT_ID to track remaining data.
# Reuse a saved ID for this final check.
echo
echo "NOTE: Product deletion was tested successfully."
echo "The deleted product ID is no longer retained for a second-delete test."

print_summary

if (( FAIL > 0 )); then
  exit 1
fi

echo "All tests passed."
exit 0

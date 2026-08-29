#!/usr/bin/env bash
set -u
BASE=http://127.0.0.1:5123
S=/home/bright/abibjobs/scripts/smoke
OUT=/home/bright/abibjobs/.smoke-out
NODE=/home/bright/.nvm/versions/node/v20.20.2/bin/node
J() { "$NODE" "$S/json.mjs" "$@"; }

mkdir -p "$OUT"
TS=$(date +%s)
POSTER_EMAIL="smokeposter_${TS}@example.com"
WORKER_EMAIL="smokeworker_${TS}@example.com"
ADMIN_EMAIL="smokeadmin_${TS}@example.com"
PASSWORD="SmokePass123!"

pass=0; fail=0
ok()  { echo "  PASS: $1"; pass=$((pass+1)); }
bad() { echo "  FAIL: $1"; fail=$((fail+1)); }

grab_cookie() { # $1 = header dump file; prints connect.sid=... (verbatim)
  grep -o 'connect\.sid=[^;]*' "$1" 2>/dev/null | head -n1
}

echo "== 1. static client serving =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$CODE" = "200" ] && ok "GET / -> $CODE" || bad "GET / -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/transactions")
[ "$CODE" = "200" ] && ok "GET /transactions -> $CODE" || bad "GET /transactions -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/payment/callback?reference=test")
[ "$CODE" = "200" ] && ok "GET /payment/callback -> $CODE" || bad "GET /payment/callback -> $CODE"

echo "== 2. unauthenticated wiring =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/transactions/history")
[ "$CODE" = "401" ] && ok "GET /api/transactions/history -> 401" || bad "history -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/wallet/banks")
[ "$CODE" = "403" ] && ok "GET /api/wallet/banks -> 403" || bad "banks -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/users")
[ "$CODE" = "403" ] && ok "GET /api/admin/users -> 403" || bad "users -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/appeals")
[ "$CODE" = "403" ] && ok "GET /api/admin/appeals -> 403" || bad "appeals -> $CODE"

echo "== 3. register users =="
curl -s -D "$OUT/poster.hdr" -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Smoke\",\"lastName\":\"Poster\",\"email\":\"$POSTER_EMAIL\",\"password\":\"$PASSWORD\",\"phoneNumber\":\"08000000001\"}" \
  "$BASE/api/auth/register" > "$OUT/poster-reg.json"
curl -s -D "$OUT/worker.hdr" -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Smoke\",\"lastName\":\"Worker\",\"email\":\"$WORKER_EMAIL\",\"password\":\"$PASSWORD\",\"phoneNumber\":\"08000000002\"}" \
  "$BASE/api/auth/register" > "$OUT/worker-reg.json"
PSID="Cookie: $(grab_cookie "$OUT/poster.hdr")"
WSID="Cookie: $(grab_cookie "$OUT/worker.hdr")"
POSTER_ID=$(J "$OUT/poster-reg.json" id)
WORKER_ID=$(J "$OUT/worker-reg.json" id)
[ -n "$POSTER_ID" ] && ok "poster registered id=$POSTER_ID" || bad "poster: $(cat "$OUT/poster-reg.json")"
[ -n "$WORKER_ID" ] && ok "worker registered id=$WORKER_ID" || bad "worker: $(cat "$OUT/worker-reg.json")"
[ -n "$POSTER_ID" ] && [ -n "${PSID#Cookie: }" ] && ok "poster session cookie captured" || bad "no poster cookie (hdr: $(cat "$OUT/poster.hdr"))"
[ -n "$WORKER_ID" ] && [ -n "${WSID#Cookie: }" ] && ok "worker session cookie captured" || bad "no worker cookie"

echo "== 4. mark profiles verified =="
OUT1=$("$NODE" --env-file=/home/bright/abibjobs/.env node_modules/tsx/dist/cli.mjs "$S/verify-user.mjs" "$POSTER_ID" 2>&1)
OUT2=$("$NODE" --env-file=/home/bright/abibjobs/.env node_modules/tsx/dist/cli.mjs "$S/verify-user.mjs" "$WORKER_ID" 2>&1)
case "$OUT1" in *verified*) ok "poster verified ($OUT1)";; *) bad "poster verify: $OUT1";; esac
case "$OUT2" in *verified*) ok "worker verified ($OUT2)";; *) bad "worker verify: $OUT2";; esac

echo "== 5. poster creates job (fee 0 bypass) =="
curl -s -H "$PSID" -H "Content-Type: application/json" \
  -d "{\"category\":\"cleaning\",\"title\":\"Smoke Test Job $TS\",\"description\":\"smoke test job\",\"location\":\"Lekki, Lagos\",\"price\":\"20000\",\"priceType\":\"total\",\"workersNeeded\":1,\"scheduledDate\":\"2026-09-10T09:00:00.000Z\"}" \
  "$BASE/api/jobs" > "$OUT/job-create.json"
JOB_ID=$(J "$OUT/job-create.json" job.id)
JOB_STATUS=$(J "$OUT/job-create.json" job.status)
FEE=$(J "$OUT/job-create.json" fee)
REF=$(J "$OUT/job-create.json" reference)
AUTHURL=$(J "$OUT/job-create.json" authorizationUrl)
echo "  job=$JOB_ID status=$JOB_STATUS fee=$FEE ref=$REF authUrl=${AUTHURL:-<null>}"
[ -n "$JOB_ID" ] && ok "job created (id=$JOB_ID)" || bad "create: $(cat "$OUT/job-create.json")"
[ "$JOB_STATUS" = "open" ] && ok "job open immediately on free path" || bad "status=$JOB_STATUS"
[ "$FEE" = "0.00" ] && ok "fee 0.00" || bad "fee=$FEE"
case "$REF" in jpf_*) ok "local reference jpf_*" ;; *) bad "reference=$REF" ;; esac
[ -z "$AUTHURL" ] && ok "authorizationUrl null" || bad "authorizationUrl=$AUTHURL"

echo "== 6. transaction history after posting =="
curl -s -H "$PSID" "$BASE/api/transactions/history" > "$OUT/history1.json"
H1_N=$(J "$OUT/history1.json" transactions.length)
H1_T=$(J "$OUT/history1.json" transactions.0.type)
H1_S=$(J "$OUT/history1.json" transactions.0.status)
H1_R=$(J "$OUT/history1.json" transactions.0.reference)
echo "  count=$H1_N type=$H1_T status=$H1_S ref=$H1_R"
{ [ "$H1_T" = "job_posting_fee" ] || [ "$H1_T" = "negotiation_fee" ]; } && ok "history has fee record ($H1_T)" || bad "history: $(cat "$OUT/history1.json")"
{ [ "$H1_S" = "paid" ] && [ "$H1_R" = "$REF" ]; } && ok "posting fee paid with local ref" || bad "status=$H1_S ref=$H1_R"

echo "== 7. offer with price increase (free delta path) =="
curl -s -H "$WSID" -H "Content-Type: application/json" \
  -d "{\"amount\":25000,\"message\":\"I can do it for 25000\"}" \
  "$BASE/api/jobs/$JOB_ID/offers" > "$OUT/offer.json"
OFFER_ID=$(J "$OUT/offer.json" id)
[ -n "$OFFER_ID" ] && ok "offer created (id=$OFFER_ID)" || bad "offer: $(cat "$OUT/offer.json")"

curl -s -H "$PSID" -H "Content-Type: application/json" -d "{}" \
  "$BASE/api/offers/$OFFER_ID/accept" > "$OUT/offer-accept.json"
REQ_PAY=$(J "$OUT/offer-accept.json" requiresPayment)
ADD_FEE=$(J "$OUT/offer-accept.json" additionalFee)
JOB_PRICE=$(J "$OUT/offer-accept.json" job.price)
OFFER_ST=$(J "$OUT/offer-accept.json" offer.status)
echo "  requiresPayment=$REQ_PAY additionalFee=$ADD_FEE job.price=$JOB_PRICE offer.status=$OFFER_ST"
[ "$REQ_PAY" = "false" ] && ok "requiresPayment false" || bad "requiresPayment=$REQ_PAY"
[ "$ADD_FEE" = "0.00" ] && ok "additionalFee 0.00" || bad "additionalFee=$ADD_FEE"
[ "$JOB_PRICE" = "25000.00" ] && ok "job price updated to 25000" || bad "price=$JOB_PRICE"
[ "$OFFER_ST" = "accepted" ] && ok "offer accepted" || bad "offer.status=$OFFER_ST"

curl -s -H "$PSID" "$BASE/api/transactions/history" > "$OUT/history2.json"
H2_T=$(J "$OUT/history2.json" transactions.0.type)
H2_R=$(J "$OUT/history2.json" transactions.0.reference)
H2_PREV=$(J "$OUT/history2.json" transactions.0.previousAmount)
H2_NEW=$(J "$OUT/history2.json" transactions.0.newAmount)
echo "  tx0 type=$H2_T ref=$H2_R prev=$H2_PREV new=$H2_NEW"
[ "$H2_T" = "negotiation_fee" ] && ok "negotiation fee recorded" || bad "type=$H2_T"
case "$H2_R" in nfa_*) ok "adjustment local ref nfa_*" ;; *) bad "ref=$H2_R" ;; esac
[ "$H2_PREV" = "20000.00" ] && [ "$H2_NEW" = "25000.00" ] && ok "delta tracked 20000->25000" || bad "prev=$H2_PREV new=$H2_NEW"

echo "== 8. worker accepts job =="
curl -s -H "$WSID" -X POST "$BASE/api/jobs/$JOB_ID/accept" > "$OUT/accept.json"
A_ST=$(J "$OUT/accept.json" status)
[ "$A_ST" = "in_progress" ] && ok "job in_progress" || bad "accept: $(cat "$OUT/accept.json")"

echo "== 9. dispute (mediation) flow =="
curl -s -H "$WSID" -H "Content-Type: application/json" \
  -d "{\"workerId\":\"$WORKER_ID\",\"message\":\"Completed work is not satisfactory\"}" \
  "$BASE/api/jobs/$JOB_ID/dispute" > "$OUT/dispute.json"
DISPUTE_ID=$(J "$OUT/dispute.json" id)
D_ST=$(J "$OUT/dispute.json" status)
[ -n "$DISPUTE_ID" ] && [ "$D_ST" = "open" ] && ok "dispute open (id=$DISPUTE_ID)" || bad "dispute: $(cat "$OUT/dispute.json")"

curl -s -H "$WSID" -H "Content-Type: application/json" \
  -d "{\"message\":\"Let us settle at 22000\",\"type\":\"proposal\",\"amount\":22000}" \
  "$BASE/api/disputes/$DISPUTE_ID/message" > "$OUT/proposal.json"
P_CNT=$(J "$OUT/proposal.json" messages.length)
{ [ "$P_CNT" = "2" ] || [ "$P_CNT" = "3" ]; } && ok "proposal message recorded (messages=$P_CNT)" || bad "proposal: $(cat "$OUT/proposal.json")"

curl -s -H "$PSID" -H "Content-Type: application/json" \
  -d "{\"amount\":22000}" \
  "$BASE/api/disputes/$DISPUTE_ID/accept-proposal" > "$OUT/resolve.json"
R_ST=$(J "$OUT/resolve.json" status)
R_RES=$(J "$OUT/resolve.json" resolution)
[ "$R_ST" = "resolved" ] && ok "dispute resolved" || bad "dispute status=$R_ST"
[ "$R_RES" = "mutual_agreement" ] && ok "resolution mutual_agreement" || bad "resolution=$R_RES"

curl -s -H "$WSID" "$BASE/api/jobs/$JOB_ID" > "$OUT/job-after.json"
JST=$(J "$OUT/job-after.json" status)
[ "$JST" = "completed" ] && ok "job completed after settlement" || bad "job status=$JST resp=$(cat "$OUT/job-after.json")"

echo "== 10. appeal rejected while active =="
curl -s -H "$WSID" -H "Content-Type: application/json" \
  -d "{\"reason\":\"This appeal should be rejected because I am active\"}" \
  "$BASE/api/appeals" > "$OUT/appeal-neg.json"
case "$(cat "$OUT/appeal-neg.json")" in
  *"not currently suspended"*) ok "appeal rejected while active" ;;
  *) bad "appeal-neg: $(cat "$OUT/appeal-neg.json")" ;;
esac

echo "== 11. staff admin: login, users, suspend, appeal, unban, banks =="
A1=$("$NODE" --env-file=/home/bright/abibjobs/.env node_modules/tsx/dist/cli.mjs "$S/create-admin.mjs" "$ADMIN_EMAIL" "$PASSWORD" 2>&1)
echo "  create-admin: $(echo "$A1" | head -c 120)"
case "$A1" in *"id"*) ok "staff admin created" ;; *) bad "create-admin: $A1" ;; esac

curl -s -D "$OUT/admin.hdr" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$BASE/api/admin/login" > "$OUT/admin-login.json"
ASID="Cookie: $(grab_cookie "$OUT/admin.hdr")"
A_ROLE=$(J "$OUT/admin-login.json" role)
[ "$A_ROLE" = "staff" ] && ok "admin login role=staff (cookie=${ASID:7:24}...)" || bad "admin login: $(cat "$OUT/admin-login.json")"

CODE=$(curl -s -o /tmp/banks.json -w "%{http_code}" -H "$ASID" "$BASE/api/wallet/banks")
[ "$CODE" = "200" ] && ok "GET /api/wallet/banks as admin -> 200" || bad "banks -> $CODE"

curl -s -H "$ASID" "$BASE/api/admin/users" > "$OUT/admin-users.json"
W_ROW=$(curl -s -H "$ASID" "$BASE/api/admin/users" | "$NODE" -e "
  const fs=require('fs');
  const list=JSON.parse(fs.readFileSync(0,'utf8'));
  if (!Array.isArray(list)) { console.log('NOT_FOUND'); process.exit(0); }
  const w=list.find(u=>u.userId==='$WORKER_ID');
  console.log(w?JSON.stringify(w):'NOT_FOUND');
")
echo "  worker row: $(echo "$W_ROW" | head -c 200)"
case "$W_ROW" in NOT_FOUND*) bad "worker not in /api/admin/users ($W_ROW)";; "") bad "worker lookup errored";; *) ok "worker in /api/admin/users";; esac

curl -s -H "$ASID" -H "Content-Type: application/json" \
  -d "{\"reason\":\"Smoke test suspension\",\"duration\":\"7 days\"}" \
  "$BASE/api/admin/users/$WORKER_ID/suspend" > "$OUT/suspend.json"
S_OK=$(J "$OUT/suspend.json" success)
S_CJ=$(J "$OUT/suspend.json" cancelledJobs)
[ "$S_OK" = "true" ] && ok "suspend wired (cancelledJobs=$S_CJ)" || bad "suspend: $(cat "$OUT/suspend.json")"

curl -s -H "$WSID" "$BASE/api/profile" > "$OUT/profile1.json"
P_SUS=$(J "$OUT/profile1.json" isSuspended)
[ "$P_SUS" = "true" ] && ok "worker profile isSuspended=true" || bad "isSuspended=$P_SUS"

curl -s -H "$WSID" -H "Content-Type: application/json" \
  -d "{\"reason\":\"Please restore my account, I promise to be better\"}" \
  "$BASE/api/appeals" > "$OUT/appeal.json"
case "$(cat "$OUT/appeal.json")" in
  *"Appeal submitted"*) ok "worker appeal submitted" ;;
  *) bad "appeal: $(cat "$OUT/appeal.json")" ;;
esac

curl -s -H "$WSID" "$BASE/api/appeals/my" > "$OUT/myappeals.json"
MY_C=$(J "$OUT/myappeals.json" length)
[ "$MY_C" = "1" ] && ok "GET /api/appeals/my -> 1 pending" || bad "my appeals: $(cat "$OUT/myappeals.json")"

APPEAL_ID=$(curl -s -H "$ASID" "$BASE/api/admin/appeals" | "$NODE" -e "
  const fs=require('fs');
  const list=JSON.parse(fs.readFileSync(0,'utf8'));
  if (!Array.isArray(list)) { console.log('NOT_FOUND'); process.exit(0); }
  const a=list.find(x=>x.userId==='$WORKER_ID' && x.status==='pending');
  console.log(a?String(a.id):'NOT_FOUND');
")
[ "$APPEAL_ID" != "NOT_FOUND" ] && [ -n "$APPEAL_ID" ] && ok "admin sees appeal (id=$APPEAL_ID)" || bad "admin appeals: no pending appeal for worker"

curl -s -H "$ASID" -H "Content-Type: application/json" \
  -d "{\"decision\":\"approved\",\"note\":\"smoke test approval\"}" \
  "$BASE/api/admin/appeals/$APPEAL_ID/review" > "$OUT/review.json"
RV_OK=$(J "$OUT/review.json" success)
[ "$RV_OK" = "true" ] && ok "appeal review approved" || bad "review: $(cat "$OUT/review.json")"

curl -s -H "$WSID" "$BASE/api/profile" > "$OUT/profile2.json"
P2_SUS=$(J "$OUT/profile2.json" isSuspended)
[ "$P2_SUS" = "false" ] && ok "worker unsuspended after approval" || bad "isSuspended=$P2_SUS"

curl -s -H "$ASID" -H "Content-Type: application/json" \
  -d "{\"reason\":\"Smoke test ban\"}" \
  "$BASE/api/admin/users/$WORKER_ID/ban" > "$OUT/ban.json"
B_OK=$(J "$OUT/ban.json" success)
[ "$B_OK" = "true" ] && ok "ban wired" || bad "ban: $(cat "$OUT/ban.json")"
curl -s -H "$WSID" "$BASE/api/profile" > "$OUT/profile3.json"
P3_BAN=$(J "$OUT/profile3.json" isBanned)
[ "$P3_BAN" = "true" ] && ok "worker isBanned=true" || bad "isBanned=$P3_BAN"

curl -s -H "$ASID" -X POST "$BASE/api/admin/users/$WORKER_ID/unban" > "$OUT/unban.json"
U_OK=$(J "$OUT/unban.json" success)
[ "$U_OK" = "true" ] && ok "unban wired" || bad "unban: $(cat "$OUT/unban.json")"

echo
echo "=================== RESULT: $pass passed, $fail failed ==================="
[ "$fail" = "0" ]
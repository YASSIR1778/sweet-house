// POS PIN login. Verifies device + PIN in the database, then issues a
// one-time sign-in token for that employee (no e-mail is sent).
import { adminClient, cors, fail, json } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { device_id, device_secret, employee_id, pin } = await req.json()
    if (!device_id || !device_secret || !employee_id || !/^\d{4}$/.test(String(pin ?? ''))) return fail('missing_fields')

    const admin = adminClient()
    const { data: res, error } = await admin.rpc('pin_verify', {
      p_device: device_id,
      p_secret: device_secret,
      p_employee: employee_id,
      p_pin: String(pin),
    })
    if (error) return fail(error.message, 500)
    if (!res?.ok) return json(res, 401)

    const { data: user, error: uErr } = await admin.auth.admin.getUserById(res.auth_user_id)
    if (uErr || !user?.user?.email) return fail('employee_not_found', 404)

    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.user.email })
    if (lErr) return fail(lErr.message, 500)

    return json({ ok: true, token_hash: link.properties.hashed_token })
  } catch (e) {
    return fail(String(e), 500)
  }
})

// Creates the very first owner account. Refuses once an owner exists.
import { adminClient, cors, fail, json } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { full_name, email, password } = await req.json()
    if (!full_name || !email || !password) return fail('missing_fields')
    if (String(password).length < 8) return fail('weak_password')

    const admin = adminClient()
    const { data: existing } = await admin.from('employees').select('id').eq('is_owner', true).is('deleted_at', null).limit(1)
    if (existing && existing.length) return fail('owner_exists', 409)

    const { data: created, error } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (error) return fail(error.message)

    const { data: role } = await admin.from('roles').select('id').eq('is_owner', true).limit(1).single()
    const { error: insErr } = await admin.from('employees').insert({
      auth_user_id: created.user.id,
      full_name,
      username: String(email).trim().toLowerCase(),
      role_id: role?.id ?? null,
      is_owner: true,
      can_use_admin: true,
      can_use_pos: true,
      color: '#FF6B35',
    })
    if (insErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return fail(insErr.message)
    }
    return json({ ok: true })
  } catch (e) {
    return fail(String(e), 500)
  }
})

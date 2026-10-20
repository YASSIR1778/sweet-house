// Create or update an employee together with its auth account.
// Caller must hold employees.manage (checked through RLS-aware RPC).
import { adminClient, callerClient, cors, fail, json, randomPassword, staffEmail } from '../_shared/common.ts'

type Payload = {
  id?: string
  full_name: string
  username?: string | null
  password?: string | null
  phone?: string | null
  avatar_url?: string | null
  color?: string
  role_id?: string | null
  extra_permissions?: string[]
  revoked_permissions?: string[]
  max_discount_percent?: number | null
  can_use_pos?: boolean
  can_use_admin?: boolean
  monthly_salary?: number
  hire_date?: string | null
  is_active?: boolean
  notes?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const caller = callerClient(req)
    const { data: allowed } = await caller.rpc('has_perm', { p: 'employees.manage' })
    if (!allowed) return fail('forbidden', 403)
    const { data: callerIsOwner } = await caller.rpc('is_owner')

    const p = (await req.json()) as Payload
    if (!p.full_name?.trim()) return fail('missing_fields')
    const username = p.username?.trim().toLowerCase() || null
    if (username && !/^[a-z0-9._-]{3,30}$/.test(username) && !username.includes('@')) return fail('invalid_username')
    if (p.password && p.password.length < 8) return fail('weak_password')

    const admin = adminClient()
    let existing: { id: string; auth_user_id: string | null; is_owner: boolean; username: string | null } | null = null
    if (p.id) {
      const { data } = await admin.from('employees').select('id, auth_user_id, is_owner, username').eq('id', p.id).single()
      existing = data
      if (!existing) return fail('employee_not_found', 404)
      if (existing.is_owner && !callerIsOwner) return fail('only_owner_can_edit_owner', 403)
    }

    if (username) {
      const { data: clash } = await admin.from('employees').select('id').eq('username', username).neq('id', p.id ?? '00000000-0000-0000-0000-000000000000')
      if (clash && clash.length) return fail('username_taken', 409)
    }

    // Owner accounts sign in with their real e-mail; staff get an internal one.
    const email = username ? (username.includes('@') ? username : staffEmail(username)) : staffEmail(`emp-${crypto.randomUUID().slice(0, 8)}`)

    let authId = existing?.auth_user_id ?? null
    if (!authId) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: p.password || randomPassword(),
        email_confirm: true,
        user_metadata: { full_name: p.full_name },
      })
      if (error) return fail(error.message)
      authId = created.user.id
    } else {
      const update: Record<string, unknown> = { user_metadata: { full_name: p.full_name } }
      if (username && username !== existing?.username) update.email = email
      if (p.password) update.password = p.password
      const { error } = await admin.auth.admin.updateUserById(authId, update)
      if (error) return fail(error.message)
    }

    const row = {
      auth_user_id: authId,
      full_name: p.full_name.trim(),
      username,
      phone: p.phone ?? null,
      avatar_url: p.avatar_url ?? null,
      color: p.color ?? '#FF6B35',
      extra_permissions: p.extra_permissions ?? [],
      revoked_permissions: p.revoked_permissions ?? [],
      max_discount_percent: p.max_discount_percent ?? null,
      can_use_pos: p.can_use_pos ?? true,
      can_use_admin: p.can_use_admin ?? false,
      monthly_salary: p.monthly_salary ?? 0,
      hire_date: p.hire_date || null,
      is_active: p.is_active ?? true,
      notes: p.notes ?? null,
      ...(existing?.is_owner ? {} : { role_id: p.role_id ?? null }),
    }

    // Write through the caller's client so the audit log records who did it.
    const q = existing
      ? caller.from('employees').update(row).eq('id', existing.id).select('id').single()
      : admin.from('employees').insert(row).select('id').single()
    const { data: saved, error: saveErr } = await q
    if (saveErr) {
      if (!existing) await admin.auth.admin.deleteUser(authId)
      return fail(saveErr.message)
    }
    return json({ ok: true, id: saved.id })
  } catch (e) {
    return fail(String(e), 500)
  }
})

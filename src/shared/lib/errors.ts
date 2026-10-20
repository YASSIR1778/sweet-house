import type { Lang } from './i18n'

const messages: Record<string, [string, string]> = {
  forbidden: ['ليست لديك صلاحية لهذه العملية', "Vous n'avez pas la permission"],
  'Invalid login credentials': ['اسم المستخدم أو كلمة السر غير صحيحة', 'Identifiants incorrects'],
  wrong_pin: ['الرمز السري غير صحيح', 'Code PIN incorrect'],
  locked: ['تم قفل الحساب مؤقتاً بعد محاولات خاطئة. حاول بعد 5 دقائق', 'Compte bloqué 5 minutes après plusieurs essais'],
  pin_not_set: ['لم يتم تحديد رمز سري لهذا الموظف', "Aucun code PIN défini pour cet employé"],
  pin_must_be_4_digits: ['الرمز السري يجب أن يكون 4 أرقام', 'Le PIN doit contenir 4 chiffres'],
  device_not_registered: ['هذا الجهاز غير مسجل. سجّله من جديد', "Cet appareil n'est pas enregistré"],
  employee_not_found: ['الموظف غير موجود أو غير مفعل', 'Employé introuvable ou inactif'],
  empty_sale: ['السلة فارغة', 'Le panier est vide'],
  invalid_qty: ['الكمية غير صحيحة', 'Quantité invalide'],
  invalid_price: ['السعر غير صحيح', 'Prix invalide'],
  price_override_forbidden: ['لا يمكنك تعديل السعر', 'Modification du prix non autorisée'],
  discount_forbidden: ['لا يمكنك إجراء تخفيض', 'Remise non autorisée'],
  discount_above_limit: ['التخفيض يتجاوز الحد المسموح لك', 'Remise supérieure à votre limite'],
  discount_exceeds_line: ['التخفيض أكبر من ثمن السطر', 'Remise supérieure au montant de la ligne'],
  discount_exceeds_total: ['التخفيض أكبر من المجموع', 'Remise supérieure au total'],
  insufficient_payment: ['المبلغ المدفوع غير كافٍ', 'Montant payé insuffisant'],
  card_exceeds_total: ['مبلغ البطاقة أكبر من المجموع', 'Montant carte supérieur au total'],
  variant_not_found: ['المنتج غير موجود', 'Produit introuvable'],
  service_not_found: ['الخدمة غير موجودة', 'Service introuvable'],
  already_voided: ['هذا البيع ملغى مسبقاً', 'Vente déjà annulée'],
  reason_required: ['يجب كتابة السبب', 'Le motif est obligatoire'],
  variant_required: ['يجب إضافة نوع واحد على الأقل', 'Au moins une variante est requise'],
  barcode_exists: ['هذا الباركود مستعمل لمنتج آخر', 'Ce code-barres est déjà utilisé'],
  only_owner_can_edit_owner: ['فقط المالك يمكنه تعديل حساب المالك', 'Seul le propriétaire peut modifier ce compte'],
  cannot_disable_last_owner: ['لا يمكن تعطيل المالك الوحيد', 'Impossible de désactiver le seul propriétaire'],
  in_use_cannot_purge: ['لا يمكن الحذف النهائي لأنه مرتبط بمبيعات سابقة', 'Suppression impossible : élément lié à des ventes'],
  username_taken: ['اسم المستخدم مستعمل', "Nom d'utilisateur déjà pris"],
  owner_exists: ['حساب المالك موجود مسبقاً', 'Le compte propriétaire existe déjà'],
  weak_password: ['كلمة السر ضعيفة (8 أحرف على الأقل)', 'Mot de passe trop faible (8 caractères min.)'],
  'Failed to fetch': ['تعذر الاتصال بالخادم. تحقق من الإنترنت', 'Connexion au serveur impossible'],
}

export function errorMessage(err: unknown, lang: Lang): string {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)
  const key = Object.keys(messages).find((k) => raw === k || raw.startsWith(k + ':') || raw.includes(k))
  if (key) return messages[key][lang === 'ar' ? 0 : 1]
  return lang === 'ar' ? `حدث خطأ: ${raw}` : `Erreur : ${raw}`
}

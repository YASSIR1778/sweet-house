-- Store categories for a general store (each shows on the site once it has a product)
update public.categories set name_ar = 'المدرسة والمكتب', name_fr = 'École et bureau', icon = 'backpack', color = '#F59E0B', sort = 9
 where deleted_at is null and name_ar = 'أدوات مدرسية';

insert into public.categories (name_ar, name_fr, icon, color, is_online, sort)
select v.name_ar, v.name_fr, v.icon, v.color, true, v.sort
from (values
  ('المنزل والمطبخ', 'Maison et cuisine', 'house', '#EA580C', 1),
  ('التنظيم والتخزين', 'Rangement', 'boxes', '#0891B2', 2),
  ('الهاتف والإلكترونيات', 'Téléphone et électronique', 'smartphone', '#2563EB', 3),
  ('الأطفال والألعاب', 'Enfants et jouets', 'puzzle', '#DB2777', 4),
  ('الحقائب والإكسسوارات', 'Sacs et accessoires', 'shopping-bag', '#7C3AED', 5),
  ('إكسسوارات السيارة', 'Accessoires auto', 'car', '#0F172A', 6),
  ('الهدايا', 'Cadeaux', 'gift', '#DC2626', 7),
  ('العناية والجمال (أدوات)', 'Soin et beauté (accessoires)', 'brush', '#D97706', 8),
  ('الرياضة والصحة', 'Sport et bien-être', 'dumbbell', '#16A34A', 10)
) as v(name_ar, name_fr, icon, color, sort)
where not exists (select 1 from public.categories c where c.deleted_at is null and c.name_ar = v.name_ar);

-- The Store website gets its own editable content (the Services site keeps "website").
insert into public.settings (key, value, is_public) values ('website_store', jsonb_build_object(
  'announcement', jsonb_build_object('enabled', false, 'text_ar', '', 'text_fr', ''),
  'hero', jsonb_build_object(
    'title_ar', 'كلشي اللي محتاج،', 'accent_ar', 'يوصلك لباب الدار',
    'title_fr', 'Tout ce qu’il vous faut,', 'accent_fr', 'livré chez vous',
    'subtitle_ar', 'منتجات عملية مختارة للدار، المطبخ، الهاتف، الأطفال والمدرسة. اطلب فدقيقة، وخلّص غير ملي توصلك.',
    'subtitle_fr', 'Des produits utiles et sélectionnés pour la maison, la cuisine, le téléphone, les enfants et l’école. Commandez en une minute, payez à la livraison.'),
  'trust', jsonb_build_array(
    jsonb_build_object('icon', 'truck', 'text_ar', 'توصيل لجميع المدن', 'text_fr', 'Livraison partout au Maroc'),
    jsonb_build_object('icon', 'wallet', 'text_ar', 'الدفع عند الاستلام', 'text_fr', 'Paiement à la livraison'),
    jsonb_build_object('icon', 'rotate-ccw', 'text_ar', 'استبدال سهل', 'text_fr', 'Échange facile'),
    jsonb_build_object('icon', 'message-circle', 'text_ar', 'دعم على واتساب', 'text_fr', 'Support WhatsApp'),
    jsonb_build_object('icon', 'shield-check', 'text_ar', 'منتجات مختارة ومجرّبة', 'text_fr', 'Produits sélectionnés')),
  'sections', jsonb_build_object('categories', true, 'best', true, 'promise', true, 'latest', true, 'school', true, 'cross', true),
  'promise', jsonb_build_object(
    'title_ar', 'ما كتخلص حتى توصلك وتشوفها بعينيك 👀', 'title_fr', 'Vous payez seulement à la réception 👀',
    'text_ar', 'توصيل سريع لجميع مدن المغرب، أو استلام من المحل فتطوان.', 'text_fr', 'Livraison rapide partout au Maroc, ou retrait à Tétouan.'),
  'faq', jsonb_build_array(
    jsonb_build_object('q_ar', 'كيفاش نطلب؟', 'q_fr', 'Comment commander ?', 'a_ar', 'اختار المنتج، عمّر الاسم والهاتف والمدينة والعنوان، وأكّد. غادي نتاصلو بيك باش نأكدو الطلبية قبل ما نصيفطوها.', 'a_fr', 'Choisissez le produit, remplissez nom, téléphone, ville et adresse, puis confirmez. Nous vous appelons pour confirmer avant l’envoi.'),
    jsonb_build_object('q_ar', 'واش كنخلص عند الاستلام؟', 'q_fr', 'Paiement à la livraison ?', 'a_ar', 'إيه، كتخلص غير ملي توصلك الطلبية وتشوفها.', 'a_fr', 'Oui, vous payez uniquement à la réception.'),
    jsonb_build_object('q_ar', 'شحال كيدير التوصيل؟', 'q_fr', 'Délais de livraison ?', 'a_ar', 'عادة بين 24 و72 ساعة حسب المدينة. فتطوان والنواحي غالباً نفس النهار أو النهار الموالي.', 'a_fr', 'En général 24 à 72 h selon la ville. Tétouan et environs : souvent le jour même ou le lendemain.'),
    jsonb_build_object('q_ar', 'واش نقدر نستبدل ولا نرجع؟', 'q_fr', 'Échange ou retour ?', 'a_ar', 'إيه، شوف صفحة «الإرجاع والاستبدال». الأهم: تشوف المنتج قدام الموزع قبل ما تخلص.', 'a_fr', 'Oui, voir « Retours et échanges ». Vérifiez le produit devant le livreur avant de payer.'),
    jsonb_build_object('q_ar', 'نقدر نجي نشري من المحل؟', 'q_fr', 'Retrait en boutique ?', 'a_ar', 'مرحبا بيك فالمحل فتطوان، أو اطلب أونلاين وخلي الطلبية تتسنّاك.', 'a_fr', 'Bienvenue en boutique à Tétouan, ou commandez en ligne et retirez sur place.'),
    jsonb_build_object('q_ar', 'كيفاش نتبّع الطلبية؟', 'q_fr', 'Suivre ma commande ?', 'a_ar', 'من صفحة «تتبّع طلبيتي» برقم التتبّع ورقم الهاتف، ولا سولنا فواتساب.', 'a_fr', 'Page « Suivi » avec le code et votre téléphone, ou sur WhatsApp.')),
  'returns', jsonb_build_array(
    jsonb_build_object('text_ar', 'شوف الطلبية قدام الموزع قبل ما تخلص. إلا كان شي مشكل، ما تقبلهاش وما كتخلص والو.', 'text_fr', 'Vérifiez devant le livreur avant de payer. En cas de problème, refusez sans rien payer.'),
    jsonb_build_object('text_ar', 'عندك 7 أيام من الاستلام باش ترجع ولا تبدّل المنتج، حتى بلا سبب (القانون 31.08).', 'text_fr', '7 jours après réception pour retourner ou échanger le produit, même sans motif (loi 31.08).'),
    jsonb_build_object('text_ar', 'المنتج خاصو يرجع فالحالة ديالو، مع الكارطونة ديالو، وما مستعملش.', 'text_fr', 'Le produit doit être retourné neuf, dans son emballage.'),
    jsonb_build_object('text_ar', 'إلا كان الغلط منّا (عيب أو منتج آخر)، الاستبدال والتوصيل علينا.', 'text_fr', 'Si l’erreur vient de nous, l’échange et la livraison sont à notre charge.'),
    jsonb_build_object('text_ar', 'إلا بدّلتي رأيك بلا عيب، التوصيل ديال الرجوع عليك.', 'text_fr', 'Si vous changez d’avis sans défaut, la livraison du retour est à votre charge.'),
    jsonb_build_object('text_ar', 'للطلب: راسلنا فواتساب برقم الطلبية وتصويرة ديال المنتج.', 'text_fr', 'Pour demander : écrivez-nous sur WhatsApp avec le numéro de commande et une photo.')),
  'seo', jsonb_build_object(
    'description_ar', 'متجر سويت هاوس بتطوان: منتجات عملية للدار والمطبخ، إكسسوارات الهاتف والسيارة، الأطفال والمدرسة. توصيل لجميع المدن والدفع عند الاستلام.',
    'description_fr', 'Sweet House Store Tétouan : maison, cuisine, accessoires téléphone et voiture, enfants, école. Livraison partout au Maroc, paiement à la livraison.')
), true)
on conflict (key) do nothing;

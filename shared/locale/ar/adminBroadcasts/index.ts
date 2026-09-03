import type { AdminBroadcastsLabels } from "@/shared/locale/types/adminBroadcasts";

export const adminBroadcastsAr: AdminBroadcastsLabels = {
  pageTitle: "إرسال إعلان",
  pageSubtitle: "أنشئ إعلاناً على مستوى النظام وسلّمه إلى كل مستلم ضمن الجمهور الذي تختاره.",
  titleLabel: "العنوان",
  titlePlaceholder: "مثال: صيانة مجدولة يوم الجمعة",
  titleRequired: "العنوان مطلوب.",
  bodyLabel: "نص الإعلان",
  bodyPlaceholder: "اكتب الإعلان الذي سيظهر للمستلمين.",
  audienceLabel: "الجمهور المستهدف",
  audienceAll: "جميع المستخدمين",
  audienceRole: "حسب الدور",
  audienceCountry: "حسب الدولة",
  audiencePlan: "حسب خطة الاشتراك",
  roleLabel: "الدور",
  countryLabel: "الدولة",
  countryPlaceholder: "مثال: مصر",
  countryHelperText: "تتم المطابقة التامة مع الدولة المسجلة لكل مستلم، بحد أقصى 100 حرف.",
  planLabel: "خطة الاشتراك",
  planLoading: "جارٍ تحميل الخطط…",
  previewDisclaimer: "يُحدَّد المستلمون وقت الإرسال — لا تُعرض قائمة المستلمين قبل الإرسال.",
  confirmTitle: "إرسال هذا الإعلان؟",
  confirmBody: "سيتم تسليم الإعلان كإشعار لكل مستلم ضمن الجمهور المحدد.",
  confirmAction: "إرسال الآن",
  cancelAction: "إلغاء",
  sendAction: "إرسال الإعلان",
  sendingAction: "جارٍ الإرسال…",
  successToast: (count: number) => {
    if (count === 0) return "لم يتم إشعار أي مستلم";
    if (count === 1) return "تم إرسال الإعلان إلى مستلم واحد";
    if (count === 2) return "تم إرسال الإعلان إلى مستلمين";
    // CLDR Arabic classes: 0→zero · 1→one · 2→two (n = 2 EXACTLY) ·
    // 3–10→few (counted plural) · 11–99→many (tamyiz singular) ·
    // everything else →other — so 100/102 land on OTHER, while 101
    // re-enters one and 103–110 re-enter few via the last-two-digit cycle.
    const cycle = count % 100;
    if (cycle === 1) return `تم إرسال الإعلان إلى ${count} مستلم`;
    if (cycle >= 3 && cycle <= 10) return `تم إرسال الإعلان إلى ${count} مستلمين`;
    if (cycle >= 11) return `تم إرسال الإعلان إلى ${count} مستلماً`;
    // cycle 0 or 2 — the CLDR `other` class (100, 102, 200, 202, …):
    // neither the one form (n % 100 = 1 only) nor the dual (n = 2 only).
    return `تم إرسال الإعلان إلى ${count} مستلماً`;
  },
  errorTitle: "تعذّر إرسال الإعلان",
};

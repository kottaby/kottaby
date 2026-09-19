import type { SubscriptionAdminLabels } from "@/shared/locale/types/subscriptionAdmin";

export const subscriptionAdminAr: SubscriptionAdminLabels = {
  title: "الاشتراكات",
  emptyState: {
    title: "لا توجد اشتراكات",
    message: "لا توجد سجلات اشتراك لهذا الطالب بعد.",
  },
  fields: {
    plan: "الخطة",
    status: "الحالة",
    start: "البداية",
    end: "النهاية",
  },
  status: {
    active: "نشط",
    expired: "منتهي",
    pending: "قيد الانتظار",
    cancelled: "ملغي",
    suspended: "موقوف",
  },
  actions: {
    extend: "تمديد",
    renew: "تجديد",
    cancel: "إلغاء الاشتراك",
    changePlan: "تغيير الخطة",
  },
  extend: {
    title: "تمديد الاشتراك",
    daysLabel: "عدد الأيام المضافة",
    daysHelper: "تُضاف إلى تاريخ نهاية الفترة الحالي.",
    daysInvalid: "أدخل عدد أيام صحيحاً أكبر من صفر.",
  },
  renew: {
    title: "تجديد الاشتراك",
    message: "يفتح التجديد فترة نشطة جديدة على خطة هذا الاشتراك ويضاف إلى رصيد الطالب عدد جلسات الخطة كاملاً.",
  },
  cancel: {
    title: "إلغاء الاشتراك",
    message: "يؤدي الإلغاء إلى إنهاء هذا الاشتراك مع إبقاء أرصدة جلسات الطالب كما هي دون أي تغيير.",
    reasonLabel: "السبب (اختياري)",
    reasonHelper: "حتى 200 حرف، ويُسجَّل في سجل التدقيق.",
  },
  changePlan: {
    title: "تغيير الخطة",
    message:
      "يُلغى الاشتراك الحالي وتفتح فترة جديدة على الخطة المحددة. لا تصلح إلا الخطط النشطة التي تُقيَّد على مسار الرصيد نفسه.",
    planLabel: "الخطة الجديدة",
    noPlans: "لا توجد خطة نشطة أخرى تُقيَّد على مسار الرصيد نفسه.",
    carried: carry => `تم تغيير الخطة — تم ترحيل ${carry} جلسة إلى الخطة الجديدة.`,
    forfeited: forfeit => `تم تغيير الخطة — تمت مصادرة ${forfeit} جلسة متبقية من الخطة السابقة.`,
  },
  success: {
    extend: days => `تم تمديد الاشتراك ${days} يوم.`,
    renew: "تم تجديد الاشتراك — فترة جديدة نشطة الآن.",
    cancel: "تم إلغاء الاشتراك. أُبقيت أرصدة الجلسات كما هي.",
    planChangeCarried: carry => `تم تغيير الخطة — تم ترحيل ${carry} جلسة.`,
    planChangeForfeited: forfeit => `تم تغيير الخطة — تمت مصادرة ${forfeit} جلسة متبقية.`,
  },
  errorState: {
    title: "تعذر تحميل الاشتراكات",
    message: "حدث خطأ أثناء تحميل اشتراكات هذا الطالب.",
    retry: "إعادة المحاولة",
  },
  genericError: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
};

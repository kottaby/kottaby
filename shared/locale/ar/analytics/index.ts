import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

/** Arabic leaf map for the `analytics` namespace (73 slots — Arabic script on every leaf). */
export const analyticsAr: AnalyticsLabels = {
  metaTitle: "تحليلات المنصة",
  metaDescription:
    "لقطة تحليلات شاملة للمنصة — المستخدمون والجلسات والإيرادات حسب العملة والاشتراكات وحضور المعلمين والتقييمات والحالة التشغيلية.",
  title: "تحليلات المنصة",
  subtitle: "لقطة حية للقراءة فقط عن حالة المنصة كاملة.",

  usersSection: "المستخدمون",
  sessionsSection: "الجلسات",
  revenueSection: "الإيرادات",
  subscriptionsSection: "الاشتراكات",
  teachersSection: "المعلمون",
  ratingsSection: "التقييمات",
  healthSection: "الحالة التشغيلية",

  totalUsersLabel: "إجمالي المستخدمين",
  activeUsersLabel: "المستخدمون النشطون",
  suspendedUsersLabel: "المستخدمون الموقوفون",
  blockedUsersLabel: "المستخدمون المحظورون",
  deletedUsersLabel: "المستخدمون المحذوفون",
  adminsCountLabel: "المشرفون",
  teachersCountLabel: "المعلمون",
  studentsCountLabel: "الطلاب",
  parentsCountLabel: "أولياء الأمور",
  newThisWeekUsersLabel: "جدد هذا الأسبوع",
  recentlyActive24hLabel: "نشِطون (آخر 24 ساعة)",

  totalSessionsLabel: "إجمالي الجلسات",
  sessionsTodayLabel: "جلسات اليوم",
  sessionsThisWeekLabel: "جلسات هذا الأسبوع",
  sessionsThisMonthLabel: "جلسات هذا الشهر",
  scheduledSessionsLabel: "مجدولة",
  startedSessionsLabel: "بدأت",
  completedSessionsLabel: "مكتملة",
  cancelledSessionsLabel: "ملغاة",
  disputedSessionsLabel: "قيد النزاع",
  awaitingConfirmationLabel: "بانتظار تأكيد الطالب",

  currencyHeader: "العملة",
  totalAmountHeader: "المبلغ الإجمالي",
  last30DaysAmountHeader: "آخر 30 يوماً",
  paidPaymentsCountHeader: "المدفوعات المسددة",
  offlineActivationsLabel: "التفعيلات دون اتصال",

  totalSubscriptionsLabel: "إجمالي الاشتراكات",
  activeSubscriptionsLabel: "الاشتراكات النشطة",
  pendingSubscriptionsLabel: "الاشتراكات المعلقة",
  expiredSubscriptionsLabel: "الاشتراكات المنتهية",
  cancelledSubscriptionsLabel: "الاشتراكات الملغاة",
  suspendedSubscriptionsLabel: "الاشتراكات الموقوفة",
  activeInWindowNowLabel: "نشط ضمن النافذة الآن",

  certifiedTeachersLabel: "المعلمون المعتمدون",
  evaluatorTeachersLabel: "المقيّمون",
  teachersOnlineNowLabel: "معلمون متصلون الآن",

  averageSessionRatingLabel: "متوسط تقييم الجلسات",
  sessionRatingsCountLabel: "عدد تقييمات الجلسات",
  averageEvaluationScoreLabel: "متوسط درجات التقييم",
  evaluationScoresCountLabel: "عدد درجات التقييم",

  pendingDisputesLabel: "النزاعات المعلقة",
  pendingWithdrawalsLabel: "طلبات السحب المعلقة",

  sessionTrendTitle: "الجلسات — آخر 30 يوماً",
  revenueTrendTitle: "الإيرادات — آخر 30 يوماً",
  dailyLabel: "يومي",
  dateAxisLabel: "التاريخ",
  amountAxisLabel: "المبلغ",
  sessionsSeriesLabel: "الجلسات",
  sessionTrendAriaLabel: "مخطط اتجاه الجلسات اليومية لآخر 30 يوماً",
  revenueTrendAriaLabel: "مخطط اتجاه الإيرادات اليومية لآخر 30 يوماً",

  noRevenueYet: "لا توجد إيرادات مسجلة عبر البوابة بعد.",
  noRatingsYet: "لا توجد تقييمات مسجلة بعد.",
  trendEmptyLabel: "لا شيء مسجل خلال آخر 30 يوماً.",

  exportAction: "تصدير CSV",
  refreshAction: "تحديث",
  refreshingLabel: "جارٍ التحديث…",
  lastUpdatedLabel: (at: string) => `آخر تحديث ${at}`,
  retryAction: "إعادة المحاولة",

  loadErrorTitle: "تعذر تحميل التحليلات",
  loadErrorBody: "حدث خطأ أثناء تحميل لقطة تحليلات المنصة. يرجى المحاولة مرة أخرى.",
  deniedTitle: "تم رفض الوصول",
  deniedBody: "ليست لديك صلاحية لعرض تحليلات المنصة.",
};

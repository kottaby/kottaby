import type { AdminFinanceLabels } from "@/shared/locale/types/adminFinance";

export const adminFinanceAr: AdminFinanceLabels = {
  metaTitle: "الشؤون المالية — أكاديمية درافت",
  metaDescription:
    "لوحة التدقيق المالي لأكاديمية درافت — سجلات المدفوعات وطابور طلبات السحب وعرض محافظ المعلمين.",
  title: "الشؤون المالية",
  subtitle: "راجع المدفوعات، واعتمد طلبات السحب، وافحص محافظ المعلمين.",
  paymentsTab: "المدفوعات",
  withdrawalsTab: "السحوبات",
  walletInspectorTab: "فاحص المحافظ",
  studentSearchLabel: "بحث عن طالب",
  statusFilterLabel: "الحالة",
  gatewayFilterLabel: "بوابة الدفع",
  dateFromLabel: "من",
  dateToLabel: "إلى",
  applyFilters: "تطبيق",
  resetFilters: "إعادة تعيين",
  studentHeader: "الطالب",
  amountHeader: "المبلغ",
  currencyHeader: "العملة",
  gatewayHeader: "بوابة الدفع",
  statusHeader: "الحالة",
  dateHeader: "التاريخ",
  paymentsResultCount: count => {
    if (count === 0) return "لا توجد مدفوعات";
    if (count === 1) return "دفعة واحدة";
    return `${count} مدفوعات`;
  },
  teacherHeader: "المعلم",
  walletBalanceHeader: "رصيد المحفظة",
  requestedAtHeader: "تاريخ الطلب",
  pendingWithdrawalsCount: count => {
    if (count === 0) return "لا توجد طلبات سحب معلقة";
    if (count === 1) return "طلب سحب معلق واحد";
    return `${count} طلبات سحب معلقة`;
  },
  approveAction: "اعتماد",
  rejectAction: "رفض",
  rejectDialogTitle: "رفض طلب السحب",
  rejectReasonLabel: "سبب الرفض",
  rejectReasonPlaceholder: "اشرح سبب رفض طلب السحب هذا",
  rejectConfirm: "رفض الطلب",
  rejectCancel: "إلغاء",
  teacherPickerLabel: "المعلم",
  teacherPickerPlaceholder: "اختر معلماً لفحص محفظته",
  balanceLabel: "الرصيد",
  totalEarningsLabel: "إجمالي الأرباح",
  typeHeader: "النوع",
  descriptionHeader: "الوصف",
  adjustDialogTitle: "تعديل رصيد المحفظة",
  directionCredit: "إضافة",
  directionDebit: "خصم",
  adjustAmountLabel: "المبلغ",
  adjustReasonLabel: "السبب",
  adjustSubmit: "تطبيق التعديل",
  loadingLabel: "جارٍ التحميل…",
  errorTitle: "تعذّر تحميل لوحة الشؤون المالية",
  forbiddenTitle: "تم رفض الوصول",
  forbiddenBody: "ليست لديك صلاحية لعرض لوحة التدقيق المالي.",
  paymentsEmpty: "لا توجد مدفوعات تطابق عوامل التصفية الحالية.",
  withdrawalsEmpty: "لا توجد طلبات سحب معلقة.",
  inspectorEmpty: "لا توجد حركات محفظة للعرض.",
};

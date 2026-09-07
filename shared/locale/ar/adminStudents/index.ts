import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

export const adminStudentsAr: AdminStudentsLabels = {
  title: "الطلاب",
  subtitle: "دليل للعرض فقط لجميع حسابات الطلاب على المنصة.",
  headers: {
    name: "الاسم",
    balances: "الأرصدة",
    parent: "ولي الأمر",
    languages: "اللغات",
    trial: "الفترة التجريبية",
    joined: "تاريخ الانضمام",
  },
  balances: {
    hifz: "الحفظ",
    reviews: "المراجعات",
    tajweed: "التجويد",
    trial: "التجربة",
  },
  parentLabels: {
    withParent: "مرتبط بولي أمر",
    noParent: "مستقل",
  },
  filters: {
    search: "بحث",
    searchPlaceholder: "ابحث بالاسم أو البريد الإلكتروني",
    hasParent: "ربط ولي الأمر",
    language: "اللغة",
    apply: "تطبيق",
    clear: "مسح المرشحات",
    refresh: "تحديث",
  },
  filterOptions: {
    all: "الكل",
  },
  trialBadge: "فترة تجريبية",
  emptyState: {
    title: "لا يوجد طلاب بعد",
    message: "ستظهر هنا حسابات الطلاب بمجرد تسجيلهم على المنصة.",
    filteredTitle: "لا يوجد طلاب مطابقون للمرشحات",
    filteredMessage: "عدّل المرشحات أعلاه أو امسحها لعرض كل الطلاب.",
  },
  errorState: {
    title: "تعذّر تحميل الطلاب",
    message: "حدث خطأ أثناء جلب دليل الطلاب. حاول مرة أخرى.",
    retry: "إعادة المحاولة",
  },
  loading: "جارٍ تحميل الطلاب",
  quickActions: {
    copyEmail: "نسخ البريد الإلكتروني",
    emailCopied: "تم نسخ البريد الإلكتروني.",
  },
  pagination: {
    page: "صفحة",
    showingPrefix: "عرض",
    of: "من",
    total: "الإجمالي",
    next: "الصفحة التالية",
    previous: "الصفحة السابقة",
    pageSize: "عدد الصفوف لكل صفحة",
  },
};

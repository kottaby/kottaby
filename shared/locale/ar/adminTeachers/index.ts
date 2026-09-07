import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

export const adminTeachersAr: AdminTeachersLabels = {
  title: "المعلمون",
  subtitle: "دليل للعرض فقط لجميع حسابات المعلمين على المنصة.",
  headers: {
    name: "الاسم",
    status: "الحالة",
    rating: "التقييم",
    subjects: "المواد",
    joined: "تاريخ الانضمام",
  },
  statusPills: {
    approved: "معتمد",
    pending: "قيد الانتظار",
    deleted: "محذوف",
    suspended: "معلّق",
    blocked: "محظور",
    online: "متصل",
    offline: "غير متصل",
    evaluator: "مقيّم",
  },
  filters: {
    search: "بحث",
    searchPlaceholder: "ابحث بالاسم أو البريد الإلكتروني",
    approval: "الاعتماد",
    online: "حالة الاتصال",
    evaluator: "مقيّم",
    clear: "مسح المرشحات",
    refresh: "تحديث",
  },
  filterOptions: {
    all: "الكل",
    nonEvaluator: "غير مقيّم",
  },
  emptyState: {
    title: "لا يوجد معلمون بعد",
    message: "ستظهر هنا حسابات المعلمين بمجرد تسجيلهم على المنصة.",
    filteredTitle: "لا يوجد معلمون مطابقون للمرشحات",
    filteredMessage: "عدّل المرشحات أعلاه أو امسحها لعرض كل المعلمين.",
  },
  errorState: {
    title: "تعذّر تحميل المعلمين",
    message: "حدث خطأ أثناء جلب دليل المعلمين. حاول مرة أخرى.",
    retry: "إعادة المحاولة",
  },
  loading: "جارٍ تحميل المعلمين",
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

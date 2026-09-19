import type { UpNextLabels } from "@/shared/locale/types/upNext";

export const upNextAr: UpNextLabels = {
  upNextTitle: "ما التالي؟",
  upcomingHeading: "الجلسات القادمة",
  upcomingEmpty: "لا جلسات قادمة بعد — ستظهر هنا الجلسات التي تحجزها.",
  sessionLine: (id: number) => `الجلسة #${id}`,
  bookedPrefix: "حُجزت في",
  sessionsCta: "عرض الجلسات",
  homeworkHeading: "الواجبات",
  homeworkPendingLine: (count: number) => {
    if (count === 0) return "لا واجبات بانتظار التقييم";
    if (count === 1) return "واجب واحد بانتظار التقييم";
    if (count === 2) return "واجبان بانتظار التقييم";
    if (count <= 10) return `${count} واجبات بانتظار التقييم`;
    return `${count} واجبًا بانتظار التقييم`;
  },
  homeworkAllGraded: "أحسنت! لا شيء بانتظار التقييم",
  loadingLabel: "جارٍ تحميل خطواتك التالية",
  errorBody: "تعذَّر تحميل خطواتك التالية.",
};

import { getCoursePricing } from "@/lib/course-pricing";
import { CoursePriceAmount } from "@/components/marketing/course-price-amount";

export async function CoursePrice({ slug }: { slug: string }) {
  return <CoursePriceAmount pricing={await getCoursePricing(slug)} />;
}

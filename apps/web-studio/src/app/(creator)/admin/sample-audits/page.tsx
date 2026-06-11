import Link from "next/link";

import { Button } from "@bytedance-aigc/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@bytedance-aigc/ui/components/ui/card";

export default function SampleAuditsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>抽样巡检</CardTitle>
          <CardDescription>按 5% 随机抽取已发布作品进行人工复审</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            功能开发中,敬请期待。完成后将支持随机抽样、分配复审人、标记违规等操作。
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">返回总览</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

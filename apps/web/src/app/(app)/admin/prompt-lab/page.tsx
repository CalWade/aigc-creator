import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PromptLabPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Prompt 实验室</CardTitle>
          <CardDescription>批量评估 Prompt 准确率,版本对比,一键上线与回滚</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            功能开发中,敬请期待。完成后将支持 Prompt 版本管理、A/B 对比评估、上线回滚。
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

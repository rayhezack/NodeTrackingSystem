import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <main className="flex min-h-[360px] items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-foreground">页面不存在</h1>
        <Link className="mt-3 inline-block text-sm text-primary hover:underline" to="/">
          返回埋点工作台
        </Link>
      </div>
    </main>
  );
};

export default NotFound;

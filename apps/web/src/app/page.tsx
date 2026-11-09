import { Button } from "@simon-says/ui/components/button";

const HomePage = () => (
  <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
    <p className="text-sm font-medium text-muted-foreground">
      Personal, illustrated takeaways
    </p>
    <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
      Simon Says
    </h1>
    <p className="max-w-xl text-lg text-muted-foreground">
      One conference session feed. Save the moments that matter to you.
    </p>
    <div className="flex flex-col items-start gap-3">
      <Button disabled>Sessions coming soon</Button>
      <p className="text-sm text-muted-foreground">
        Live capture and personal recaps are still in development.
      </p>
    </div>
  </main>
);

export default HomePage;

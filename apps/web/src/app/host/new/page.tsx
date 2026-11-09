import type { Metadata } from "next";
import { HostSetup } from "./host-setup";

export const metadata: Metadata = { title: "New session · Simon Says" };

const HostSetupPage = () => <HostSetup />;

export default HostSetupPage;

using BenchmarkDotNet.Running;

namespace AuctionOperationsPortal.Benchmarks;

public static class BenchmarkProgram
{
    public static void Main(string[] args) => BenchmarkSwitcher.FromAssembly(typeof(BenchmarkProgram).Assembly).Run(args);
}

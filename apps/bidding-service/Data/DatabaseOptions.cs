namespace bidding_service.Data;

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    public bool ApplyMigrations { get; set; } = true;
    public bool SeedDemoData { get; set; } = true;
}

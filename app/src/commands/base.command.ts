abstract class BaseCommand {
  abstract execute(data: object): Promise<void>;
}

export default BaseCommand;

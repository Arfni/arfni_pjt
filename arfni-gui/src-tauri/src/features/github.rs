use std::io;
use std::process::Command;



pub fn run_git(args: &[&str]) -> io::Result<()> {
    println!("> git {}", args.join(" "));
    let status = Command::new("git").args(args).status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::Other, format!("git {} failed", args.join(" "))))
    }
}

//저장소를 특정 폴더로 클론
pub fn clone_full(url:&str, dest:&str)->io::Result<()> {

    run_git(&["clone",url,dest])

}

